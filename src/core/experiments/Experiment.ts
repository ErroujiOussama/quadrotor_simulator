/**
 * Experiment runner + scoring — turns the simulator into a lab. An experiment is
 * just a setup function over an ordinary Simulation plus a duration and optional
 * timed events; the runner steps it headless and computes an objective scorecard
 * from the logged history. Reproducible for a fixed seed (constitution P2).
 */
import { Simulation } from "../sim/Simulation";
import type { SimulationData } from "../sim/types";
import type { AirframeType } from "../vehicles/airframes";
import { clamp } from "../math/constants";

const RAD2DEG = 180 / Math.PI;

export interface Scorecard {
  durationS: number;
  positionRMSE: number;       // m, state vs logged setpoint (steady window)
  attitudeRMSE: number;       // rad
  altitudeRiseTime: number | null;
  altitudeSettlingTime: number | null;
  altitudeOvershoot: number | null; // %
  maxTiltDeg: number;
  energyWh: number;
  controlEffort: number;      // mean |Δthrottle| per second (lower = smoother)
  crashed: boolean;
  completed: boolean;
  score: number;              // 0–100 composite
}

export interface ExperimentEvent {
  t: number;
  apply: (sim: Simulation) => void;
}

export interface ExperimentSpec {
  id: string;
  name: string;
  description: string;
  airframe?: AirframeType;
  seed?: number;
  durationS: number;
  /** Configure mode/setpoints/wind/failures/gains/waypoints before the run. */
  setup: (sim: Simulation) => void;
  /** Optional timed disturbances (e.g. inject a motor failure at t = 6 s). */
  events?: ExperimentEvent[];
}

export interface ExperimentResult {
  spec: ExperimentSpec;
  scorecard: Scorecard;
  history: SimulationData[];
}

/** Battery nominal voltage assumption for the energy figure (4S LiPo). */
const NOMINAL_VOLTAGE = 14.8;

export function computeScorecard(sim: Simulation, history: SimulationData[], durationS: number): Scorecard {
  const m = sim.getMetrics();

  // Steady-window tracking error: state vs the setpoint logged at each sample.
  const start = Math.floor(history.length * 0.4);
  const window = history.slice(start);
  let posSq = 0, attSq = 0, maxTilt = 0;
  for (const d of window) {
    const p = d.state.position, sp = d.setpoints.position;
    posSq += (p.x - sp.x) ** 2 + (p.y - sp.y) ** 2 + (p.z - sp.z) ** 2;
    const tilt = Math.hypot(d.state.orientation.roll, d.state.orientation.pitch);
    attSq += tilt * tilt;
    if (tilt > maxTilt) maxTilt = tilt;
  }
  const positionRMSE = window.length ? Math.sqrt(posSq / window.length) : 0;
  const attitudeRMSE = window.length ? Math.sqrt(attSq / window.length) : 0;

  // Control effort: mean per-rotor throttle change per second in the steady
  // window (smoothness; excludes the initial climb transient).
  let effortSum = 0, effortCount = 0;
  for (let i = Math.max(1, start); i < history.length; i++) {
    const a = history[i].motorThrottles, b = history[i - 1].motorThrottles;
    let d = 0;
    for (let k = 0; k < a.length; k++) d += Math.abs(a[k] - (b[k] ?? 0));
    effortSum += d / Math.max(1, a.length);
    effortCount++;
  }
  const dt = sim.getConfig().timestep;
  const controlEffort = effortCount ? (effortSum / effortCount) / dt : 0;

  const last = history[history.length - 1];
  const energyWh = (last?.battery.drawnAh ?? 0) * NOMINAL_VOLTAGE;

  // Crash detection: non-finite/diverged state; a fast fall near the ground; or
  // sitting on the ground while a positive altitude is commanded.
  let crashed = false;
  let groundSamples = 0;
  const groundLimit = 0.5 / dt; // ~0.5 s grounded ⇒ crashed
  for (const d of history) {
    const p = d.state.position;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) { crashed = true; break; }
    if (Math.abs(p.x) > 1000 || Math.abs(p.y) > 1000 || Math.abs(p.z) > 1000) { crashed = true; break; }
    // Fast descent near the ground (before the contact model clamps velocity).
    if (d.time > 1 && d.setpoints.position.z > 1 && p.z < 1.0 && d.state.velocity.z < -3) { crashed = true; break; }
    // Stuck on the ground despite a commanded climb.
    if (d.time > 3 && d.setpoints.position.z > 1 && p.z < 0.1) {
      if (++groundSamples > groundLimit) { crashed = true; break; }
    } else {
      groundSamples = 0;
    }
  }

  const tiltDeg = maxTilt * RAD2DEG;
  let score = 100
    - positionRMSE * 40
    - (m.altitudeOvershoot ?? 0) * 0.4
    - Math.max(0, tiltDeg - 15) * 1.0
    - controlEffort * 5;
  score = crashed ? 0 : clamp(score, 0, 100);

  return {
    durationS,
    positionRMSE,
    attitudeRMSE,
    altitudeRiseTime: m.altitudeRiseTime,
    altitudeSettlingTime: m.altitudeSettlingTime,
    altitudeOvershoot: m.altitudeOvershoot,
    maxTiltDeg: tiltDeg,
    energyWh,
    controlEffort,
    crashed,
    completed: !crashed,
    score,
  };
}

/** Run an experiment headless and return its scorecard + history. */
export function runExperiment(spec: ExperimentSpec): ExperimentResult {
  const sim = new Simulation({ seed: spec.seed ?? 1, airframe: spec.airframe });
  spec.setup(sim);

  const events = (spec.events ?? []).slice().sort((a, b) => a.t - b.t);
  let ei = 0;
  const dt = sim.getConfig().timestep;
  const steps = Math.max(1, Math.round(spec.durationS / dt));
  for (let i = 0; i < steps; i++) {
    while (ei < events.length && events[ei].t <= sim.getTime() + 1e-9) {
      events[ei].apply(sim);
      ei++;
    }
    sim.step();
  }

  const history = sim.getDataHistory();
  return { spec, scorecard: computeScorecard(sim, history, spec.durationS), history };
}
