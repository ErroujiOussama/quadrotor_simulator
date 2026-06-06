/**
 * Serializable simulation types shared between the engine, the Web Worker
 * protocol, and the UI. All plain objects (structured-clone safe).
 */
import type { FlightMode, ManualInputs, ControlOutputs, ControlErrors, SetPoints, ControllerConfig } from "../control/FlightController";
import type { MissionState } from "../mission/WaypointPlanner";
import type { WindConfig } from "../physics/Environment";
import type { MultirotorParams } from "../vehicles/Multirotor";

export interface EulerState {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  orientation: { roll: number; pitch: number; yaw: number };
  angularVelocity: { x: number; y: number; z: number };
}

export interface MotorInputs {
  motor1: number;
  motor2: number;
  motor3: number;
  motor4: number;
}

export interface FailureConfig {
  motorFailures: [boolean, boolean, boolean, boolean];
  sensorNoise: number;
}

export const DEFAULT_FAILURES: FailureConfig = {
  motorFailures: [false, false, false, false],
  sensorNoise: 0,
};

export interface EstimationConfig {
  /** Run the sensor suite + estimator and report estimated state/error. */
  enabled: boolean;
  // NOTE: closing the control loop on the estimate (fly-on-estimate) needs a
  // gyro-bias-estimating EKF — deferred to a future spec. The estimator here is
  // display/analysis only; the validated control loop still uses true state.
}

export const DEFAULT_ESTIMATION: EstimationConfig = {
  enabled: false,
};

export interface SimulationConfig {
  timestep: number;
  realTimeMultiplier: number;
  enablePhysics: boolean;
  enableControl: boolean;
}

export const DEFAULT_SIM_CONFIG: SimulationConfig = {
  timestep: 0.01,
  realTimeMultiplier: 1.0,
  enablePhysics: true,
  enableControl: true,
};

export interface BatteryTelemetry {
  soc: number;       // 0–1
  voltage: number;   // V (under load)
  drawnAh: number;
  flightTimeS: number;
}

/** One simulation sample — what the UI renders and the CSV exports. */
export interface SimulationData {
  time: number;
  state: EulerState;
  /** Per-rotor commanded throttle [0,1]; length = airframe rotor count. */
  motorThrottles: number[];
  /** Per-rotor ESC output speed [0,1]; length = airframe rotor count. */
  motorSpeeds: number[];
  /** Active airframe id (e.g. "quad_x", "hexa_x"). */
  airframe: string;
  controlOutputs: ControlOutputs;
  errors: ControlErrors;
  setpoints: SetPoints;
  flightMode: FlightMode;
  manualInputs: ManualInputs;
  missionState: MissionState;
  battery: BatteryTelemetry;
  /** Estimated state (present when estimation is enabled). */
  estimated?: EulerState;
  /** Estimated-vs-true error: position (m) and attitude (rad) magnitudes. */
  estimationError?: { position: number; attitude: number };
}

export interface PerformanceMetrics {
  altitudeRiseTime: number | null;
  altitudeSettlingTime: number | null;
  altitudeOvershoot: number | null;
  altitudeSteadyStateError: number | null;
  positionRMSE: number;
  attitudeRMSE: number;
}

/** A reproducible run: seed + config + the input timeline. Replay → same trajectory. */
export interface RunRecord {
  seed: number;
  simConfig: SimulationConfig;
  controllerConfig: ControllerConfig;
  droneParams: MultirotorParams;
  wind: WindConfig;
  failures: FailureConfig;
  initialFlightMode: FlightMode;
  /** Sparse timeline of input events keyed by sim time. */
  events: Array<{ t: number; kind: string; payload: unknown }>;
}
