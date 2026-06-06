/**
 * DroneSimulator — main-thread adapter around the headless core Simulation.
 *
 * It preserves the historical public API the UI depends on (callbacks, flight
 * modes, live tuning, mission planner, CSV export) while delegating all physics
 * and control to @/core. The fixed-step accumulator loop runs via
 * requestAnimationFrame, decoupled from the simulation timestep, and React
 * callbacks are throttled to 30 Hz.
 *
 * A Web Worker path also exists (src/workers/sim.worker.ts + core SimEngine);
 * wiring the UI onto it is a follow-up (the mission panel mutates the planner
 * synchronously today). Running on the main thread keeps behavior identical for
 * now and hosts cleanly on static platforms.
 */
import { Simulation } from "@/core";
import type {
  SimulationData, SimulationConfig, FlightMode, ManualInputs,
  ControllerConfig, SetPoints, WindConfig, FailureConfig, EulerState,
  RotorCraftParams, AirframeType, AirframeSpec, EstimationConfig,
} from "@/core";
import { buildAirframe } from "@/core";
import type { DroneParameters } from "@/lib/physics/DroneModel";

// Re-export the types the UI imports from this module's historical path.
export type {
  SimulationData, SimulationConfig, FlightMode, ManualInputs,
  ControllerConfig, SetPoints,
} from "@/core";
export type { AirframeType } from "@/core";

const LEGACY_DEFAULT_PARAMS: DroneParameters = {
  mass: 1.5,
  length: 0.25,
  inertia: { Ixx: 0.0347563, Iyy: 0.0347563, Izz: 0.0577 },
  dragCoeff: 0.05,
  maxThrust: 15,
  thrustToTorqueRatio: 0.016,
  motorTimeConstant: 0.08,
};

/** Map UI drone params to core RotorCraft params (arm length is handled by the airframe). */
function toCoreParams(p: Partial<DroneParameters>): Partial<RotorCraftParams> {
  const out: Partial<RotorCraftParams> = {};
  if (p.mass !== undefined) out.mass = p.mass;
  if (p.inertia !== undefined) out.inertia = p.inertia;
  if (p.dragCoeff !== undefined) out.dragCoeff = p.dragCoeff;
  if (p.maxThrust !== undefined) out.maxThrustPerMotor = p.maxThrust;
  if (p.thrustToTorqueRatio !== undefined) out.thrustToTorqueRatio = p.thrustToTorqueRatio;
  if (p.motorTimeConstant !== undefined) out.motorTimeConstant = p.motorTimeConstant;
  return out;
}

export class DroneSimulator {
  private sim: Simulation;

  private isRunning = false;
  private animationId: number | null = null;
  private lastFrameTime = 0;
  private accumulatedTime = 0;
  private latestTrueState: EulerState | null = null;

  private onUpdate?: (data: SimulationData) => void;
  private onReset?: () => void;
  private lastCallbackTime = 0;
  private readonly callbackIntervalMs = 1000 / 30;

  constructor() {
    this.sim = new Simulation({
      droneParams: toCoreParams(LEGACY_DEFAULT_PARAMS),
      armLength: LEGACY_DEFAULT_PARAMS.length,
      airframe: "quad_x",
    });
    this.sim.setFlightMode("position_hold");
  }

  /** Enable/disable the sensor suite + state estimator (display/analysis only). */
  setEstimation(c: Partial<EstimationConfig>) { this.sim.setEstimation(c); }
  getEstimation(): EstimationConfig { return this.sim.getEstimation(); }

  /** Switch the airframe (quad/hexa/octo). Preserves the current state. */
  setAirframe(type: AirframeType) { this.sim.setAirframe(type); }
  getAirframeType(): AirframeType { return this.sim.getAirframeType(); }
  getAirframe(): AirframeSpec { return this.sim.getAirframe(); }

  /** Shared planner instance — the UI mutates this directly. */
  get waypoints() { return this.sim.waypoints; }

  // ── Config passthrough ─────────────────────────────────────────
  setConfig(c: Partial<SimulationConfig>) { this.sim.setConfig(c); }
  getConfig(): SimulationConfig { return this.sim.getConfig(); }
  setControllerConfig(c: ControllerConfig) { this.sim.setControllerConfig(c); }
  getControllerConfig(): ControllerConfig { return this.sim.getControllerConfig(); }
  setSetpoints(s: Partial<SetPoints>) { this.sim.setSetpoints(s); }
  getSetpoints(): SetPoints { return this.sim.getSetpoints(); }
  setFlightMode(m: FlightMode) { this.sim.setFlightMode(m); }
  getFlightMode(): FlightMode { return this.sim.getFlightMode(); }
  setManualInputs(i: Partial<ManualInputs>) { this.sim.setManualInputs(i); }
  getManualInputs(): ManualInputs { return this.sim.getManualInputs(); }
  setWind(w: Partial<WindConfig>) { this.sim.setWind(w); }
  setFailures(f: Partial<FailureConfig>) { this.sim.setFailures(f); }
  updateDroneParameters(p: Partial<DroneParameters>) {
    this.sim.updateDroneParameters(toCoreParams(p));
    if (p.length !== undefined) this.sim.setArmLength(p.length); // arm length lives in the airframe
  }

  getDroneState(): EulerState { return this.sim.getEulerState(); }
  getLatestTrueState(): EulerState | null { return this.latestTrueState; }
  getDataHistory(): SimulationData[] { return this.sim.getDataHistory(); }
  getCurrentData(): SimulationData | null { return this.sim.getCurrentData(); }
  isSimulationRunning(): boolean { return this.isRunning; }
  getMetrics() { return this.sim.getMetrics(); }

  setUpdateCallback(cb: (data: SimulationData) => void) { this.onUpdate = cb; }
  setResetCallback(cb: () => void) { this.onReset = cb; }

  // ── Run loop (rAF, fixed-step accumulator) ─────────────────────
  private animate = (frameTime: number): void => {
    if (!this.isRunning) return;
    const wallDelta = Math.min(frameTime - this.lastFrameTime, 100);
    this.lastFrameTime = frameTime;
    const cfg = this.sim.getConfig();
    this.accumulatedTime += wallDelta * cfg.realTimeMultiplier;

    const stepMs = cfg.timestep * 1000;
    let steps = 0;
    while (this.accumulatedTime >= stepMs && steps < 20) {
      this.sim.step();
      this.accumulatedTime -= stepMs;
      steps++;
    }

    const latest = this.sim.getCurrentData();
    if (latest) this.latestTrueState = latest.state;

    if (this.onUpdate && frameTime - this.lastCallbackTime >= this.callbackIntervalMs) {
      if (latest) this.onUpdate(latest);
      this.lastCallbackTime = frameTime;
    }

    this.animationId = requestAnimationFrame(this.animate);
  };

  start() {
    if (!this.isRunning) {
      this.isRunning = true;
      this.lastFrameTime = performance.now();
      this.accumulatedTime = 0;
      this.animationId = requestAnimationFrame(this.animate);
    }
  }

  pause() {
    this.isRunning = false;
    if (this.animationId !== null) { cancelAnimationFrame(this.animationId); this.animationId = null; }
  }

  reset() {
    this.pause();
    this.sim.reset();
    this.latestTrueState = null;
    this.lastCallbackTime = 0;
    if (this.onReset) this.onReset();
  }

  /** Export telemetry (including battery channels) as a downloaded CSV. */
  exportCSV() {
    const hist = this.sim.getDataHistory();
    const motorCount = hist[0]?.motorThrottles.length ?? this.sim.getAirframe().rotorCount;
    const motorCols = Array.from({ length: motorCount }, (_, i) => `m${i + 1}`).join(",");
    const header =
      `time,x,y,z,vx,vy,vz,roll,pitch,yaw,wx,wy,wz,${motorCols},` +
      "alt_err,roll_err,pitch_err,yaw_err,soc,voltage,flight_time_s\n";
    const rows = hist.map((d) => {
      const s = d.state;
      return [
        d.time.toFixed(4),
        s.position.x.toFixed(4), s.position.y.toFixed(4), s.position.z.toFixed(4),
        s.velocity.x.toFixed(4), s.velocity.y.toFixed(4), s.velocity.z.toFixed(4),
        s.orientation.roll.toFixed(4), s.orientation.pitch.toFixed(4), s.orientation.yaw.toFixed(4),
        s.angularVelocity.x.toFixed(4), s.angularVelocity.y.toFixed(4), s.angularVelocity.z.toFixed(4),
        ...d.motorThrottles.map((m) => m.toFixed(4)),
        d.errors.altitude.toFixed(4), d.errors.roll.toFixed(4),
        d.errors.pitch.toFixed(4), d.errors.yaw.toFixed(4),
        d.battery.soc.toFixed(4), d.battery.voltage.toFixed(3), d.battery.flightTimeS.toFixed(1),
      ].join(",");
    }).join("\n");

    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flight_log_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
