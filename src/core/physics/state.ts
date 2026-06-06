/**
 * Rigid-body state and its derivative, plus the small algebra integrators need.
 * Attitude is a quaternion (constitution Article III). World frame is ENU-ish:
 * +Z is up; gravity acts along −Z.
 */
import { Vec3 } from "../math/Vec3";
import { Quat } from "../math/Quat";

export interface BodyState {
  /** World-frame position (m). */
  position: Vec3;
  /** World-frame velocity (m/s). */
  velocity: Vec3;
  /** Body→world attitude. */
  attitude: Quat;
  /** Body-frame angular velocity (p, q, r) in rad/s. */
  angularVel: Vec3;
}

export interface Derivative {
  dPos: Vec3; // = velocity
  dVel: Vec3; // = acceleration (world)
  dQuat: Quat; // quaternion rate
  dOmega: Vec3; // body angular acceleration
}

export type DerivativeFn = (s: BodyState) => Derivative;

/** s + d·h (attitude added component-wise; caller normalizes when appropriate). */
export function addScaled(s: BodyState, d: Derivative, h: number): BodyState {
  return {
    position: s.position.add(d.dPos.scale(h)),
    velocity: s.velocity.add(d.dVel.scale(h)),
    attitude: s.attitude.addScaled(d.dQuat, h),
    angularVel: s.angularVel.add(d.dOmega.scale(h)),
  };
}

export function cloneState(s: BodyState): BodyState {
  return {
    position: s.position,
    velocity: s.velocity,
    attitude: s.attitude,
    angularVel: s.angularVel,
  };
}

export function stateIsFinite(s: BodyState): boolean {
  return (
    s.position.isFinite() && s.velocity.isFinite() &&
    s.attitude.isFinite() && s.angularVel.isFinite()
  );
}
