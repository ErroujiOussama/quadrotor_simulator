/**
 * Unit quaternion for body→world attitude (constitution Article III: attitude is
 * stored as a quaternion; Euler angles are a display/IO convenience only).
 *
 * Convention: Hamilton quaternion q = (w, x, y, z), rotating a body-frame vector
 * into the world frame. Euler conversion uses the aerospace ZYX (yaw-pitch-roll)
 * sequence to match the rest of the codebase.
 */
import { Vec3 } from "./Vec3";
import { clamp } from "./constants";

export class Quat {
  constructor(
    readonly w: number = 1,
    readonly x: number = 0,
    readonly y: number = 0,
    readonly z: number = 0,
  ) {}

  static readonly IDENTITY = new Quat(1, 0, 0, 0);

  /** From aerospace ZYX Euler angles (roll about X, pitch about Y, yaw about Z), radians. */
  static fromEuler(roll: number, pitch: number, yaw: number): Quat {
    const cr = Math.cos(roll * 0.5), sr = Math.sin(roll * 0.5);
    const cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5);
    const cy = Math.cos(yaw * 0.5), sy = Math.sin(yaw * 0.5);
    return new Quat(
      cr * cp * cy + sr * sp * sy,
      sr * cp * cy - cr * sp * sy,
      cr * sp * cy + sr * cp * sy,
      cr * cp * sy - sr * sp * cy,
    ).normalize();
  }

  /** Rotation of `angle` radians about a (not necessarily unit) axis. */
  static fromAxisAngle(axis: Vec3, angle: number): Quat {
    const n = axis.normalize();
    const h = angle * 0.5;
    const s = Math.sin(h);
    return new Quat(Math.cos(h), n.x * s, n.y * s, n.z * s);
  }

  /** Hamilton product this ⊗ b. */
  mul(b: Quat): Quat {
    return new Quat(
      this.w * b.w - this.x * b.x - this.y * b.y - this.z * b.z,
      this.w * b.x + this.x * b.w + this.y * b.z - this.z * b.y,
      this.w * b.y - this.x * b.z + this.y * b.w + this.z * b.x,
      this.w * b.z + this.x * b.y - this.y * b.x + this.z * b.w,
    );
  }

  normSq(): number {
    return this.w * this.w + this.x * this.x + this.y * this.y + this.z * this.z;
  }

  norm(): number {
    return Math.sqrt(this.normSq());
  }

  normalize(): Quat {
    const n = this.norm();
    if (n < 1e-12) return Quat.IDENTITY;
    const inv = 1 / n;
    return new Quat(this.w * inv, this.x * inv, this.y * inv, this.z * inv);
  }

  conjugate(): Quat {
    return new Quat(this.w, -this.x, -this.y, -this.z);
  }

  /** Rotate a vector from body frame to world frame: v_world = q * v * q⁻¹. */
  rotate(v: Vec3): Vec3 {
    // Optimized q·v·q* using the standard t = 2·(q_vec × v) formulation.
    const qx = this.x, qy = this.y, qz = this.z, qw = this.w;
    const tx = 2 * (qy * v.z - qz * v.y);
    const ty = 2 * (qz * v.x - qx * v.z);
    const tz = 2 * (qx * v.y - qy * v.x);
    return new Vec3(
      v.x + qw * tx + (qy * tz - qz * ty),
      v.y + qw * ty + (qz * tx - qx * tz),
      v.z + qw * tz + (qx * ty - qy * tx),
    );
  }

  /** Rotate a vector from world frame back to body frame. */
  rotateInverse(v: Vec3): Vec3 {
    return this.conjugate().rotate(v);
  }

  /**
   * Quaternion derivative for a body-frame angular velocity ω (rad/s):
   *   q̇ = ½ · q ⊗ (0, ω)
   * Used by integrators; the result is NOT a unit quaternion (it's a rate).
   */
  derivative(omegaBody: Vec3): Quat {
    const half = 0.5;
    return new Quat(
      half * (-this.x * omegaBody.x - this.y * omegaBody.y - this.z * omegaBody.z),
      half * (this.w * omegaBody.x + this.y * omegaBody.z - this.z * omegaBody.y),
      half * (this.w * omegaBody.y - this.x * omegaBody.z + this.z * omegaBody.x),
      half * (this.w * omegaBody.z + this.x * omegaBody.y - this.y * omegaBody.x),
    );
  }

  /** q + r·s, component-wise (used inside integrators). Not normalized. */
  addScaled(r: Quat, s: number): Quat {
    return new Quat(this.w + r.w * s, this.x + r.x * s, this.y + r.y * s, this.z + r.z * s);
  }

  /** To aerospace ZYX Euler angles { roll, pitch, yaw } in radians. */
  toEuler(): { roll: number; pitch: number; yaw: number } {
    const { w, x, y, z } = this;
    // roll (X)
    const sinrCosp = 2 * (w * x + y * z);
    const cosrCosp = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinrCosp, cosrCosp);
    // pitch (Y) — clamp to avoid NaN at the poles
    const sinp = 2 * (w * y - z * x);
    const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(clamp(sinp, -1, 1));
    // yaw (Z)
    const sinyCosp = 2 * (w * z + x * y);
    const cosyCosp = 1 - 2 * (y * y + z * z);
    const yaw = Math.atan2(sinyCosp, cosyCosp);
    return { roll, pitch, yaw };
  }

  toObject(): { w: number; x: number; y: number; z: number } {
    return { w: this.w, x: this.x, y: this.y, z: this.z };
  }

  isFinite(): boolean {
    return (
      Number.isFinite(this.w) && Number.isFinite(this.x) &&
      Number.isFinite(this.y) && Number.isFinite(this.z)
    );
  }
}
