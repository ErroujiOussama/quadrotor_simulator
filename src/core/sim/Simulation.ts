/**
 * Simulation — the headless engine that owns the vehicle, controller, mission,
 * and environment, and advances them at a fixed timestep. No timers, no rAF, no
 * DOM: callers (a Web Worker, a rAF loop, or a Node batch script) drive it by
 * calling step(). This is what makes runs reproducible and testable.
 */
import { SeededRng } from "../rng/SeededRng";
import { Multirotor, MultirotorParams, DEFAULT_MULTIROTOR } from "../vehicles/Multirotor";
import { Environment, WindConfig } from "../physics/Environment";
import {
  FlightController, FlightMode, ManualInputs, ControllerConfig,
  SetPoints, DEFAULT_CONTROLLER_CONFIG, ControlOutputs,
} from "../control/FlightController";
import { WaypointPlanner } from "../mission/WaypointPlanner";
import { IntegratorName } from "../physics/integrators";
import {
  SimulationConfig, SimulationData, EulerState, FailureConfig, MotorInputs,
  PerformanceMetrics, BatteryTelemetry, DEFAULT_SIM_CONFIG, DEFAULT_FAILURES,
} from "./types";

export interface SimulationOptions {
  seed?: number;
  config?: Partial<SimulationConfig>;
  controllerConfig?: ControllerConfig;
  droneParams?: Partial<MultirotorParams>;
  integrator?: IntegratorName;
}

const ZERO_OUTPUTS: ControlOutputs = { altitude: 0, roll: 0, pitch: 0, yaw: 0, positionX: 0, positionY: 0 };

export class Simulation {
  readonly waypoints = new WaypointPlanner();
  private rng: SeededRng;
  private drone: Multirotor;
  private controller: FlightController;
  private env: Environment;

  private config: SimulationConfig;
  private failures: FailureConfig = { ...DEFAULT_FAILURES };
  private setpoints: SetPoints = { position: { x: 0, y: 0, z: 2 }, attitude: { roll: 0, pitch: 0, yaw: 0 } };
  private flightMode: FlightMode = "position_hold";
  private manualInputs: ManualInputs = { pitch: 0, roll: 0, yaw: 0, throttle: 0.5 };
  private seed: number;

  private currentTime = 0;
  private history: SimulationData[] = [];
  private readonly maxHistory = 12000;

  constructor(opts: SimulationOptions = {}) {
    this.seed = opts.seed ?? 12345;
    this.rng = new SeededRng(this.seed);
    this.config = { ...DEFAULT_SIM_CONFIG, ...opts.config };
    this.drone = new Multirotor({ params: opts.droneParams, integrator: opts.integrator ?? "rk4" });
    this.controller = new FlightController(opts.controllerConfig ?? DEFAULT_CONTROLLER_CONFIG);
    this.env = new Environment(this.rng);
  }

  // ── Configuration ──────────────────────────────────────────────
  setConfig(c: Partial<SimulationConfig>) { this.config = { ...this.config, ...c }; }
  getConfig(): SimulationConfig { return { ...this.config }; }
  setControllerConfig(c: ControllerConfig) { this.controller.setConfig(c); }
  getControllerConfig(): ControllerConfig { return this.controller.getConfig(); }
  setSetpoints(s: Partial<SetPoints>) {
    this.setpoints = {
      position: { ...this.setpoints.position, ...s.position },
      attitude: { ...this.setpoints.attitude, ...s.attitude },
    };
  }
  getSetpoints(): SetPoints { return structuredClone(this.setpoints); }
  setFlightMode(m: FlightMode) { this.flightMode = m; }
  getFlightMode(): FlightMode { return this.flightMode; }
  setManualInputs(i: Partial<ManualInputs>) { this.manualInputs = { ...this.manualInputs, ...i }; }
  getManualInputs(): ManualInputs { return { ...this.manualInputs }; }
  setWind(w: Partial<WindConfig>) { this.env.setWind(w); }
  setFailures(f: Partial<FailureConfig>) {
    this.failures = { ...this.failures, ...f };
    this.drone.setMotorFailures(this.failures.motorFailures);
  }
  updateDroneParameters(p: Partial<MultirotorParams>) { this.drone.setParams(p); }
  setIntegrator(name: IntegratorName) { this.drone.setIntegrator(name); }

  // ── State access ───────────────────────────────────────────────
  /** True Euler-view state (no sensor noise) for display/logging. */
  getEulerState(): EulerState { return this.toEuler(); }
  getCurrentData(): SimulationData | null { return this.history[this.history.length - 1] ?? null; }
  getDataHistory(): SimulationData[] { return this.history; }
  getTime(): number { return this.currentTime; }

  private toEuler(): EulerState {
    const s = this.drone.state;
    const e = s.attitude.toEuler();
    return {
      position: s.position.toObject(),
      velocity: s.velocity.toObject(),
      orientation: e,
      angularVelocity: s.angularVel.toObject(),
    };
  }

  private batteryTelemetry(): BatteryTelemetry {
    const speeds = this.drone.getMotorSpeeds();
    const frac = (speeds[0] + speeds[1] + speeds[2] + speeds[3]) / 4;
    const current = frac * this.drone.getParams().maxCurrentA;
    return {
      soc: this.drone.battery.getSoc(),
      voltage: this.drone.battery.voltage(),
      drawnAh: this.drone.battery.getDrawnAh(),
      flightTimeS: this.drone.battery.flightTimeEstimateS(Math.max(1e-3, current)),
    };
  }

  // ── Stepping ───────────────────────────────────────────────────
  /** Advance one fixed timestep (uses config.timestep). */
  step(): void {
    const dt = this.config.timestep;
    const euler = this.drone.state.attitude.toEuler();
    const truePos = this.drone.state.position;

    // Sensor noise on the position the controller sees (deterministic via RNG).
    const n = this.failures.sensorNoise;
    const sensed = {
      position: n > 0
        ? { x: truePos.x + (this.rng.next() - 0.5) * 2 * n, y: truePos.y + (this.rng.next() - 0.5) * 2 * n, z: truePos.z + (this.rng.next() - 0.5) * 2 * n }
        : truePos.toObject(),
      velocity: this.drone.state.velocity.toObject(),
      euler,
    };

    // Mission: drive setpoints from the active waypoint.
    if (this.flightMode === "mission") {
      const target = this.waypoints.update(sensed.position, dt);
      if (target) this.setpoints.position = { ...target };
    }

    let ctrl: ControlOutputs;
    let cmd: [number, number, number, number];

    const hover = this.drone.hoverThrottle();
    if (this.config.enableControl && this.flightMode !== "manual") {
      ctrl = this.controller.control(sensed, this.setpoints, dt);
      cmd = this.controller.mix(this.flightMode, ctrl, this.manualInputs, hover);
    } else if (this.flightMode === "manual") {
      ctrl = ZERO_OUTPUTS;
      cmd = this.controller.mix("manual", ctrl, this.manualInputs, hover);
    } else {
      ctrl = ZERO_OUTPUTS;
      cmd = [0.6, 0.6, 0.6, 0.6];
    }

    const errors = (this.config.enableControl && this.flightMode !== "manual")
      ? this.controller.getErrors()
      : { altitude: 0, roll: 0, pitch: 0, yaw: 0, positionX: 0, positionY: 0 };

    this.drone.setCommand(cmd);
    if (this.config.enablePhysics) {
      const wind = this.env.windVelocity(dt);
      this.drone.step(dt, wind);
    }

    const speeds = this.drone.getMotorSpeeds();
    const motorInputs: MotorInputs = { motor1: cmd[0], motor2: cmd[1], motor3: cmd[2], motor4: cmd[3] };

    const data: SimulationData = {
      time: this.currentTime,
      state: this.toEuler(),
      motorInputs,
      motorSpeeds: speeds,
      controlOutputs: ctrl,
      errors,
      setpoints: structuredClone(this.setpoints),
      flightMode: this.flightMode,
      manualInputs: { ...this.manualInputs },
      missionState: this.waypoints.getMissionState(),
      battery: this.batteryTelemetry(),
    };

    this.history.push(data);
    if (this.history.length > this.maxHistory) this.history.shift();
    this.currentTime += dt;
  }

  /** Run N steps (batch/headless use). */
  run(steps: number): void {
    for (let i = 0; i < steps; i++) this.step();
  }

  reset() {
    this.rng = new SeededRng(this.seed);
    this.env = new Environment(this.rng);
    this.drone.reset();
    this.drone.setMotorFailures(this.failures.motorFailures);
    this.controller.reset();
    this.currentTime = 0;
    this.history = [];
    this.setpoints = { position: { x: 0, y: 0, z: 2 }, attitude: { roll: 0, pitch: 0, yaw: 0 } };
  }

  // ── Metrics ────────────────────────────────────────────────────
  getMetrics(): PerformanceMetrics {
    if (this.history.length < 10) {
      return { altitudeRiseTime: null, altitudeSettlingTime: null, altitudeOvershoot: null, altitudeSteadyStateError: null, positionRMSE: 0, attitudeRMSE: 0 };
    }
    const recent = this.history.slice(-500);
    const posRMSE = Math.sqrt(
      recent.reduce((s, d) => s + d.errors.positionX ** 2 + d.errors.positionY ** 2, 0) / (recent.length * 2),
    );
    const attRMSE = Math.sqrt(
      recent.reduce((s, d) => s + d.errors.roll ** 2 + d.errors.pitch ** 2, 0) / (recent.length * 2),
    );

    // Altitude step-response metrics relative to the current Z setpoint.
    const target = this.setpoints.position.z;
    const startZ = this.history[0].state.position.z;
    const span = target - startZ;
    let riseTime: number | null = null;
    let overshoot: number | null = null;
    let settlingTime: number | null = null;
    if (Math.abs(span) > 0.05) {
      const t0 = this.history[0].time;
      let peak = startZ;
      for (const d of this.history) {
        const z = d.state.position.z;
        const frac = (z - startZ) / span;
        if (riseTime === null && frac >= 0.9) riseTime = d.time - t0;
        if ((span > 0 && z > peak) || (span < 0 && z < peak)) peak = z;
        if (Math.abs(z - target) > 0.02 * Math.abs(span)) settlingTime = d.time - t0;
      }
      overshoot = span !== 0 ? Math.max(0, ((peak - target) / span) * 100) : 0;
    }

    return {
      altitudeRiseTime: riseTime,
      altitudeSettlingTime: settlingTime,
      altitudeOvershoot: overshoot,
      altitudeSteadyStateError: Math.abs(recent[recent.length - 1].errors.altitude),
      positionRMSE: posRMSE,
      attitudeRMSE: attRMSE,
    };
  }

  getSeed(): number { return this.seed; }
}
