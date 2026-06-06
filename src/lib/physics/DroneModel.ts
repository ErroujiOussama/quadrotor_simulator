/**
 * Compatibility shim. The physics implementation now lives in the headless
 * engine at src/core (constitution P3); this file only re-exports the types the
 * UI imports under their historical names, plus the legacy-named DroneParameters
 * the control panel binds to (mapped to core MultirotorParams in the adapter).
 */
export type {
  EulerState as DroneState,
  MotorInputs,
  FailureConfig,
} from "@/core";
export type { WindConfig } from "@/core";

/** UI-facing drone parameters (legacy field names). Mapped to MultirotorParams. */
export interface DroneParameters {
  mass: number;
  length: number; // arm length (m)
  inertia: { Ixx: number; Iyy: number; Izz: number };
  dragCoeff: number;
  maxThrust: number; // per-motor max thrust (N)
  thrustToTorqueRatio: number;
  motorTimeConstant: number;
}
