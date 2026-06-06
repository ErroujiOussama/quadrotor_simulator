/**
 * @flylab/core — headless, framework-agnostic flight-dynamics engine.
 *
 * Zero DOM / React / Three.js dependencies (constitution P3): this module runs
 * identically in the browser, a Web Worker, and Node.js. The UI consumes this;
 * this never imports the UI.
 *
 * Public API surface (spec 001 FR8). Keep this barrel curated and stable.
 */

// Math
export { Vec3 } from "./math/Vec3";
export { Quat } from "./math/Quat";
export * from "./math/constants";

// Randomness (deterministic)
export { SeededRng } from "./rng/SeededRng";
export type { Rng } from "./rng/SeededRng";

// Physics
export type { BodyState, Derivative, DerivativeFn } from "./physics/state";
export { addScaled, cloneState, stateIsFinite } from "./physics/state";
export {
  rk4,
  rk45,
  semiImplicit,
  getIntegrator,
  INTEGRATORS,
} from "./physics/integrators";
export type { Integrator, IntegratorName } from "./physics/integrators";
export { Battery, DEFAULT_BATTERY } from "./physics/Battery";
export type { BatterySpec } from "./physics/Battery";

// Vehicles
export { Multirotor, DEFAULT_MULTIROTOR } from "./vehicles/Multirotor";
export type {
  MultirotorParams,
  MultirotorOptions,
  MotorCommand,
} from "./vehicles/Multirotor";

// Environment
export { Environment, DEFAULT_WIND } from "./physics/Environment";
export type { WindConfig } from "./physics/Environment";

// Control
export {
  PIDController,
  CascadedPIDController,
} from "./control/PIDController";
export type { PIDGains, PIDState } from "./control/PIDController";
export {
  FlightController,
  DEFAULT_CONTROLLER_CONFIG,
} from "./control/FlightController";
export type {
  FlightMode,
  ManualInputs,
  ControllerConfig,
  SetPoints,
  ControlOutputs,
  ControlErrors,
} from "./control/FlightController";

// Mission
export {
  WaypointPlanner,
  createWaypoint,
} from "./mission/WaypointPlanner";
export type { Waypoint, MissionState, MissionStatus } from "./mission/WaypointPlanner";

// Simulation
export { Simulation } from "./sim/Simulation";
export type { SimulationOptions } from "./sim/Simulation";
export { simulationFromRecord, replay } from "./sim/RunRecord";
export {
  DEFAULT_SIM_CONFIG,
  DEFAULT_FAILURES,
} from "./sim/types";
export type {
  SimulationConfig,
  SimulationData,
  EulerState,
  MotorInputs,
  FailureConfig,
  PerformanceMetrics,
  BatteryTelemetry,
  RunRecord,
} from "./sim/types";

/** Engine semantic version (independent of the app version). */
export const CORE_VERSION = "0.1.0";
