/**
 * StateEstimator — fuses sensor readings into an estimated vehicle state, the
 * way a real autopilot does (it never sees the truth).
 *
 * Attitude: Mahony complementary filter — integrate the gyro on the quaternion,
 * correct toward the accelerometer's gravity direction (when |accel| ≈ g) and a
 * magnetometer yaw reference.
 * Position/velocity: three independent 2-state ([p, v]) Kalman filters, predicted
 * with world-frame acceleration (Rₑₛₜ·accel + g) and corrected by GPS (x, y) and
 * the barometer (z).
 */
import { Vec3 } from "../math/Vec3";
import { Quat } from "../math/Quat";
import { GRAVITY } from "../math/constants";
import type { BodyState } from "../physics/state";
import type { ImuReading } from "../sensors/Sensors";

export interface EstimatorConfig {
  kpGrav: number;       // accelerometer correction gain
  kpYaw: number;        // magnetometer yaw correction gain
  accelProcNoise: number; // KF process noise std-dev (m/s²)
  gpsMeasNoise: number; // m
  baroMeasNoise: number; // m
}

export const DEFAULT_ESTIMATOR_CONFIG: EstimatorConfig = {
  kpGrav: 2.5,
  kpYaw: 1.2,
  accelProcNoise: 0.6,
  gpsMeasNoise: 0.5,
  baroMeasNoise: 0.15,
};

const G_WORLD = new Vec3(0, 0, -GRAVITY);

/** One axis of a [position, velocity] Kalman filter. */
interface Axis {
  p: number; v: number;
  // covariance [[P00,P01],[P10,P11]]
  P00: number; P01: number; P10: number; P11: number;
}

function newAxis(p: number): Axis {
  return { p, v: 0, P00: 1, P01: 0, P10: 0, P11: 1 };
}

export class StateEstimator {
  private cfg: EstimatorConfig;
  private q: Quat;
  private axes: [Axis, Axis, Axis];
  private magYaw: number | null = null;
  private lastGyro = Vec3.ZERO;

  constructor(initial: Partial<BodyState> = {}, cfg: EstimatorConfig = DEFAULT_ESTIMATOR_CONFIG) {
    this.cfg = { ...cfg };
    this.q = initial.attitude ?? Quat.IDENTITY;
    const p = initial.position ?? Vec3.ZERO;
    this.axes = [newAxis(p.x), newAxis(p.y), newAxis(p.z)];
  }

  setMagYaw(yaw: number) { this.magYaw = yaw; }

  /** Mahony attitude update + KF time-update using the IMU reading over dt. */
  predict(imu: ImuReading, dt: number): void {
    // ── Attitude (Mahony) ──
    let omega = imu.gyro;
    const accelMag = imu.accel.length();
    // Trust the accelerometer only when it's close to 1 g (near-static).
    if (accelMag > 0.7 * GRAVITY && accelMag < 1.3 * GRAVITY) {
      const measuredDown = imu.accel.normalize().negate();              // gravity dir in body
      const expectedDown = this.q.rotateInverse(new Vec3(0, 0, -1));    // estimate's gravity dir
      const err = measuredDown.cross(expectedDown);                     // body-frame rotation error
      omega = omega.add(err.scale(this.cfg.kpGrav));
    }
    if (this.magYaw !== null) {
      const estYaw = this.q.toEuler().yaw;
      let dy = this.magYaw - estYaw;
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
      omega = omega.add(new Vec3(0, 0, dy * this.cfg.kpYaw));
    }
    this.lastGyro = imu.gyro;
    this.q = this.q.addScaled(this.q.derivative(omega), dt).normalize();

    // ── Position/velocity KF predict ──
    const aWorld = this.q.rotate(imu.accel).add(G_WORLD); // R·f + g
    const a = [aWorld.x, aWorld.y, aWorld.z];
    const sa = this.cfg.accelProcNoise;
    const q11 = sa * sa * (dt ** 4) / 4;
    const q12 = sa * sa * (dt ** 3) / 2;
    const q22 = sa * sa * (dt ** 2);
    for (let i = 0; i < 3; i++) {
      const ax = this.axes[i];
      // state predict: p += v dt + 0.5 a dt², v += a dt
      ax.p += ax.v * dt + 0.5 * a[i] * dt * dt;
      ax.v += a[i] * dt;
      // covariance predict: P = F P Fᵀ + Q,  F = [[1,dt],[0,1]]
      const P00 = ax.P00 + dt * (ax.P10 + ax.P01) + dt * dt * ax.P11;
      const P01 = ax.P01 + dt * ax.P11;
      const P10 = ax.P10 + dt * ax.P11;
      const P11 = ax.P11;
      ax.P00 = P00 + q11; ax.P01 = P01 + q12; ax.P10 = P10 + q12; ax.P11 = P11 + q22;
    }
  }

  private fusePosition(i: number, z: number, r: number): void {
    const ax = this.axes[i];
    const S = ax.P00 + r;
    const k0 = ax.P00 / S;
    const k1 = ax.P10 / S;
    const y = z - ax.p;
    ax.p += k0 * y;
    ax.v += k1 * y;
    // P = (I - K H) P,  H = [1 0]
    const P00 = (1 - k0) * ax.P00;
    const P01 = (1 - k0) * ax.P01;
    const P10 = ax.P10 - k1 * ax.P00;
    const P11 = ax.P11 - k1 * ax.P01;
    ax.P00 = P00; ax.P01 = P01; ax.P10 = P10; ax.P11 = P11;
  }

  fuseGps(pos: { x: number; y: number; z: number }): void {
    const r = this.cfg.gpsMeasNoise ** 2;
    this.fusePosition(0, pos.x, r);
    this.fusePosition(1, pos.y, r);
  }

  fuseBaro(alt: number): void {
    this.fusePosition(2, alt, this.cfg.baroMeasNoise ** 2);
  }

  getState(): BodyState {
    return {
      position: new Vec3(this.axes[0].p, this.axes[1].p, this.axes[2].p),
      velocity: new Vec3(this.axes[0].v, this.axes[1].v, this.axes[2].v),
      attitude: this.q,
      angularVel: this.lastGyro,
    };
  }

  reset(initial: Partial<BodyState> = {}): void {
    this.q = initial.attitude ?? Quat.IDENTITY;
    const p = initial.position ?? Vec3.ZERO;
    this.axes = [newAxis(p.x), newAxis(p.y), newAxis(p.z)];
    this.magYaw = null;
    this.lastGyro = Vec3.ZERO;
  }
}
