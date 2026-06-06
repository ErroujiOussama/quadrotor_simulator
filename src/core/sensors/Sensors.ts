/**
 * Sensor models — IMU, GPS, barometer, magnetometer. They turn the true vehicle
 * state into the noisy, biased, rate-limited measurements a real autopilot sees.
 * All randomness flows through the injected seeded RNG (constitution P2), so a
 * given seed reproduces the exact measurement stream.
 */
import { Vec3 } from "../math/Vec3";
import { GRAVITY } from "../math/constants";
import type { BodyState } from "../physics/state";
import type { Rng } from "../rng/SeededRng";

export interface ImuReading {
  /** Body-frame specific force (m/s²): f = Rᵀ(a_world − g). Hover reads ≈ +9.81 ẑ. */
  accel: Vec3;
  /** Body-frame angular rate (rad/s). */
  gyro: Vec3;
}

export interface SensorConfig {
  accelNoise: number;   // m/s², std-dev per axis
  gyroNoise: number;    // rad/s, std-dev per axis
  accelBias: Vec3;      // constant m/s²
  gyroBias: Vec3;       // constant rad/s
  gpsNoise: number;     // m, std-dev per axis
  gpsRateHz: number;    // Hz
  baroNoise: number;    // m
  baroBiasWalk: number; // m/√s random-walk rate
  magNoise: number;     // rad
}

export const DEFAULT_SENSOR_CONFIG: SensorConfig = {
  accelNoise: 0.2,
  gyroNoise: 0.01,
  accelBias: new Vec3(0.05, -0.03, 0.04),
  gyroBias: new Vec3(0.002, -0.001, 0.0015),
  gpsNoise: 0.5,
  gpsRateHz: 5,
  baroNoise: 0.15,
  baroBiasWalk: 0.02,
  magNoise: 0.02,
};

const G_WORLD = new Vec3(0, 0, -GRAVITY);

export class SensorSuite {
  private cfg: SensorConfig;
  private rng: Rng;
  private gpsAccumulator = 0;
  private baroBias = 0;

  constructor(rng: Rng, cfg: SensorConfig = DEFAULT_SENSOR_CONFIG) {
    this.rng = rng;
    this.cfg = { ...cfg };
  }

  setConfig(c: Partial<SensorConfig>) { this.cfg = { ...this.cfg, ...c }; }
  getConfig(): SensorConfig { return { ...this.cfg }; }

  private noisy3(stdDev: number): Vec3 {
    return new Vec3(this.rng.gaussian() * stdDev, this.rng.gaussian() * stdDev, this.rng.gaussian() * stdDev);
  }

  /**
   * Accelerometer + gyro. `accelWorld` is the true inertial acceleration of the
   * body (m/s², world frame); specific force = Rᵀ(a_world − g).
   */
  imu(state: BodyState, accelWorld: Vec3): ImuReading {
    const specificForceWorld = accelWorld.sub(G_WORLD); // a − g
    const accelBody = state.attitude.rotateInverse(specificForceWorld);
    return {
      accel: accelBody.add(this.cfg.accelBias).add(this.noisy3(this.cfg.accelNoise)),
      gyro: state.angularVel.add(this.cfg.gyroBias).add(this.noisy3(this.cfg.gyroNoise)),
    };
  }

  /** GPS fix at the configured rate, or null between updates. */
  gps(state: BodyState, dt: number): { x: number; y: number; z: number } | null {
    this.gpsAccumulator += dt;
    const period = 1 / this.cfg.gpsRateHz;
    if (this.gpsAccumulator < period) return null;
    this.gpsAccumulator -= period;
    const p = state.position;
    const n = this.cfg.gpsNoise;
    return {
      x: p.x + this.rng.gaussian() * n,
      y: p.y + this.rng.gaussian() * n,
      z: p.z + this.rng.gaussian() * n,
    };
  }

  /** Barometric altitude with white noise + a slow random-walk bias. */
  baro(state: BodyState, dt: number): number {
    this.baroBias += this.rng.gaussian() * this.cfg.baroBiasWalk * Math.sqrt(dt);
    return state.position.z + this.baroBias + this.rng.gaussian() * this.cfg.baroNoise;
  }

  /** Magnetometer-derived heading (yaw, rad) with noise. */
  mag(state: BodyState): number {
    return state.attitude.toEuler().yaw + this.rng.gaussian() * this.cfg.magNoise;
  }

  reset() {
    this.gpsAccumulator = 0;
    this.baroBias = 0;
  }
}
