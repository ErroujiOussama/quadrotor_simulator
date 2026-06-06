/**
 * Vehicle plugin interface (constitution P4). Any flying object the simulation
 * can advance implements this. The engine only depends on these methods, so new
 * airframes (multirotor, fixed-wing, VTOL, …) are added without editing the
 * integrator or controller.
 */
import { Vec3 } from "../math/Vec3";
import type { BodyState } from "../physics/state";
import type { Battery } from "../physics/Battery";

export interface Vehicle {
  /** Current rigid-body state (quaternion attitude). */
  state: BodyState;
  /** Number of independent actuators (e.g. rotors). */
  readonly actuatorCount: number;
  /** Set normalized actuator commands [0,1]. Length must equal actuatorCount. */
  setCommand(cmd: number[]): void;
  /** Advance one step of dt seconds in the given world-frame air velocity. */
  step(dt: number, windWorld?: Vec3): void;
  /** Per-actuator throttle [0,1] that balances gravity in hover. */
  hoverThrottle(): number;
  /** Euler angles (display/IO only — attitude is the quaternion). */
  eulerAngles(): { roll: number; pitch: number; yaw: number };
  /** Reset to an initial state. */
  reset(initial?: Partial<BodyState>): void;
  /** Optional energy source. */
  readonly battery?: Battery;
}
