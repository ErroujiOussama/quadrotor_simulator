/**
 * Simulation — the headless engine that owns the vehicle, controller, mission,
 * and environment, and advances them at a fixed timestep. No timers, no rAF, no
 * DOM: callers (a Web Worker, a rAF loop, or a Node batch script) drive it by
 * calling step(). This is what makes runs reproducible and testable.
 *
 * The vehicle is a generalized RotorCraft (spec 002): the airframe (quad/hexa/
 * octo/…) can be switched at runtime, and the controller's axes are mapped to
 * per-rotor throttles by the airframe's mixer.
 */
import { SeededRng } from "../rng/SeededRng";
import { RotorCraft, RotorCraftParams } from "../vehicles/RotorCraft";
import { AirframeSpec, AirframeType, buildAirframe, mixToThrottles } from "../vehicles/airframes";
import { Environment, WindConfig } from "../physics/Environment";
import { SensorSuite } from "../sensors/Sensors";
import { StateEstimator } from "../estimation/StateEstimator";
import { Vec3 } from "../math/Vec3";
import {
  FlightController, FlightMode, ManualInputs, ControllerConfig,
  SetPoints, DEFAULT_CONTROLLER_CONFIG, ControlOutputs,
} from "../control/FlightController";
import { WaypointPlanner } from "../mission/WaypointPlanner";
import { IntegratorName } from "../physics/integrators";
import {
  SimulationConfig, SimulationData, EulerState, FailureConfig, EstimationConfig,
  PerformanceMetrics, BatteryTelemetry, DEFAULT_SIM_CONFIG, DEFAULT_FAILURES, DEFAULT_ESTIMATION,
} from "./types";

export interface SimulationOptions {
  seed?: number;
  config?: Partial<SimulationConfig>;
  controllerConfig?: ControllerConfig;
  droneParams?: Partial<RotorCraftParams>;
  integrator?: IntegratorName;
  airframe?: AirframeType;
  armLength?: number;
}

const ZERO_OUTPUTS: ControlOutputs = { altitude: 0, roll: 0, pitch: 0, yaw: 0, positionX: 0, positionY: 0 };

function wrapPi(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export class Simulation {
  readonly waypoints = new WaypointPlanner();
  private rng: SeededRng;
  private drone: RotorCraft;
  private controller: FlightController;
  private env: Environment;

  private airframe: AirframeSpec;
  private airframeType: AirframeType;
  private armLength: number;
  private droneParams: Partial<RotorCraftParams>;
  private integrator: IntegratorName;

  private sensors: SensorSuite;
  private estimator: StateEstimator;
  private estimation: EstimationConfig = { ...DEFAULT_ESTIMATION };
  private prevVelocity = Vec3.ZERO;

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
    this.airframeType = opts.airframe ?? "quad_x";
    this.armLength = opts.armLength ?? 0.25;
    this.droneParams = { ...opts.droneParams };
    this.integrator = opts.integrator ?? "rk4";
    this.airframe = buildAirframe(this.airframeType, this.armLength);
    this.drone = new RotorCraft({ airframe: this.airframe, params: this.droneParams, integrator: this.integrator });
    this.controller = new FlightController(opts.controllerConfig ?? DEFAULT_CONTROLLER_CONFIG);
    this.env = new Environment(this.rng);
    // Sensors draw from an independent forked stream so enabling estimation never
    // perturbs the physics/control RNG (the truth trajectory is unaffected).
    this.sensors = new SensorSuite(this.rng.fork());
    this.estimator = new StateEstimator({ position: this.drone.state.position, attitude: this.drone.state.attitude });
  }

  setEstimation(c: Partial<EstimationConfig>) { this.estimation = { ...this.estimation, ...c }; }
  getEstimation(): EstimationConfig { return { ...this.estimation }; }

  private rebuildDrone(initial?: Partial<RotorCraft["state"]>) {
    this.airframe = buildAirframe(this.airframeType, this.armLength);
    this.drone = new RotorCraft({
      airframe: this.airframe,
      params: this.droneParams,
      integrator: this.integrator,
      initialState: initial,
    });
    this.drone.setMotorFailures(this.failures.motorFailures);
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
  updateDroneParameters(p: Partial<RotorCraftParams>) {
    this.droneParams = { ...this.droneParams, ...p };
    this.drone.setParams(p);
  }
  setIntegrator(name: IntegratorName) { this.integrator = name; this.rebuildDrone(this.drone.state); }

  /** Switch airframe (quad/hexa/octo). Preserves the current rigid-body state. */
  setAirframe(type: AirframeType, armLength?: number) {
    this.airframeType = type;
    if (armLength !== undefined) this.armLength = armLength;
    this.rebuildDrone(this.drone.state);
  }
  getAirframeType(): AirframeType { return this.airframeType; }
  getAirframe(): AirframeSpec { return this.airframe; }
  setArmLength(arm: number) { this.armLength = arm; this.rebuildDrone(this.drone.state); }

  // ── State access ───────────────────────────────────────────────
  getEulerState(): EulerState { return this.toEuler(); }
  getCurrentData(): SimulationData | null { return this.history[this.history.length - 1] ?? null; }
  getDataHistory(): SimulationData[] { return this.history; }
  getTime(): number { return this.currentTime; }

  private toEuler(): EulerState {
    const s = this.drone.state;
    return {
      position: s.position.toObject(),
      velocity: s.velocity.toObject(),
      orientation: s.attitude.toEuler(),
      angularVelocity: s.angularVel.toObject(),
    };
  }

  private batteryTelemetry(): BatteryTelemetry {
    const speeds = this.drone.getMotorSpeeds();
    const frac = speeds.reduce((a, b) => a + b, 0) / Math.max(1, speeds.length);
    const current = frac * this.drone.getParams().maxCurrentA;
    return {
      soc: this.drone.battery.getSoc(),
      voltage: this.drone.battery.voltage(),
      drawnAh: this.drone.battery.getDrawnAh(),
      flightTimeS: this.drone.battery.flightTimeEstimateS(Math.max(1e-3, current)),
    };
  }

  // ── Stepping ───────────────────────────────────────────────────
  step(): void {
    const dt = this.config.timestep;
    const euler = this.drone.state.attitude.toEuler();
    const truePos = this.drone.state.position;
    const n = this.failures.sensorNoise;

    // ── State estimation (optional) ──
    let estimated: EulerState | undefined;
    if (this.estimation.enabled) {
      const curVel = this.drone.state.velocity;
      const accelWorld = curVel.sub(this.prevVelocity).scale(1 / dt);
      this.prevVelocity = curVel;
      const imu = this.sensors.imu(this.drone.state, accelWorld);
      this.estimator.setMagYaw(this.sensors.mag(this.drone.state));
      this.estimator.predict(imu, dt);
      const gps = this.sensors.gps(this.drone.state, dt);
      if (gps) this.estimator.fuseGps(gps);
      this.estimator.fuseBaro(this.sensors.baro(this.drone.state, dt));
      const es = this.estimator.getState();
      estimated = {
        position: es.position.toObject(),
        velocity: es.velocity.toObject(),
        orientation: es.attitude.toEuler(),
        angularVelocity: es.angularVel.toObject(),
      };
    }

    // Controller feedback: noisy true state. (The estimator runs for display/
    // analysis only; closing the loop on it needs a full EKF — future spec.)
    const feedback = {
      position: n > 0
        ? { x: truePos.x + (this.rng.next() - 0.5) * 2 * n, y: truePos.y + (this.rng.next() - 0.5) * 2 * n, z: truePos.z + (this.rng.next() - 0.5) * 2 * n }
        : truePos.toObject(),
      velocity: this.drone.state.velocity.toObject(),
      euler,
    };

    if (this.flightMode === "mission") {
      const target = this.waypoints.update(feedback.position, dt);
      if (target) this.setpoints.position = { ...target };
    }

    const rotorCount = this.drone.actuatorCount;
    const hover = this.drone.hoverThrottle();
    let ctrl: ControlOutputs;
    let cmd: number[];

    if (this.config.enableControl && this.flightMode !== "manual") {
      ctrl = this.controller.control(feedback, this.setpoints, dt);
      const a = this.controller.axes(this.flightMode, ctrl, this.manualInputs, hover);
      cmd = mixToThrottles(this.airframe, a.base, a.roll, a.pitch, a.yaw);
    } else if (this.flightMode === "manual") {
      ctrl = ZERO_OUTPUTS;
      const a = this.controller.axes("manual", ctrl, this.manualInputs, hover);
      cmd = mixToThrottles(this.airframe, a.base, a.roll, a.pitch, a.yaw);
    } else {
      ctrl = ZERO_OUTPUTS;
      cmd = new Array(rotorCount).fill(0.6);
    }

    const errors = (this.config.enableControl && this.flightMode !== "manual")
      ? this.controller.getErrors()
      : { altitude: 0, roll: 0, pitch: 0, yaw: 0, positionX: 0, positionY: 0 };

    this.drone.setCommand(cmd);
    if (this.config.enablePhysics) {
      const wind = this.env.windVelocity(dt);
      this.drone.step(dt, wind);
    }

    const data: SimulationData = {
      time: this.currentTime,
      state: this.toEuler(),
      motorThrottles: cmd,
      motorSpeeds: this.drone.getMotorSpeeds(),
      airframe: this.airframe.id,
      controlOutputs: ctrl,
      errors,
      setpoints: structuredClone(this.setpoints),
      flightMode: this.flightMode,
      manualInputs: { ...this.manualInputs },
      missionState: this.waypoints.getMissionState(),
      battery: this.batteryTelemetry(),
    };

    if (estimated) {
      const trueE = data.state;
      data.estimated = estimated;
      const dp = Math.hypot(
        estimated.position.x - trueE.position.x,
        estimated.position.y - trueE.position.y,
        estimated.position.z - trueE.position.z,
      );
      const da = Math.hypot(
        wrapPi(estimated.orientation.roll - trueE.orientation.roll),
        wrapPi(estimated.orientation.pitch - trueE.orientation.pitch),
        wrapPi(estimated.orientation.yaw - trueE.orientation.yaw),
      );
      data.estimationError = { position: dp, attitude: da };
    }

    this.history.push(data);
    if (this.history.length > this.maxHistory) this.history.shift();
    this.currentTime += dt;
  }

  run(steps: number): void {
    for (let i = 0; i < steps; i++) this.step();
  }

  reset() {
    this.rng = new SeededRng(this.seed);
    this.env = new Environment(this.rng);
    this.sensors = new SensorSuite(this.rng.fork());
    this.rebuildDrone();
    this.estimator = new StateEstimator({ position: this.drone.state.position, attitude: this.drone.state.attitude });
    this.prevVelocity = Vec3.ZERO;
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
