import { describe, it, expect } from "vitest";
import { Vec3 } from "../math/Vec3";
import { Quat } from "../math/Quat";
import { SeededRng } from "../rng/SeededRng";
import { SensorSuite, DEFAULT_SENSOR_CONFIG } from "./Sensors";
import type { BodyState } from "../physics/state";
import { GRAVITY } from "../math/constants";

const level = (): BodyState => ({
  position: new Vec3(1, 2, 3),
  velocity: Vec3.ZERO,
  attitude: Quat.IDENTITY,
  angularVel: Vec3.ZERO,
});

describe("SensorSuite", () => {
  it("IMU reads ≈ +1g up in body Z when hovering level (AC implicit)", () => {
    const s = new SensorSuite(new SeededRng(1), { ...DEFAULT_SENSOR_CONFIG, accelNoise: 0, gyroNoise: 0, accelBias: Vec3.ZERO, gyroBias: Vec3.ZERO });
    const r = s.imu(level(), Vec3.ZERO); // no inertial accel → pure gravity
    expect(r.accel.z).toBeCloseTo(GRAVITY, 6);
    expect(Math.abs(r.accel.x)).toBeLessThan(1e-9);
    expect(Math.abs(r.accel.y)).toBeLessThan(1e-9);
  });

  it("AC3: noise std-dev matches config and is deterministic for a seed", () => {
    const cfg = { ...DEFAULT_SENSOR_CONFIG, accelBias: Vec3.ZERO };
    const a = new SensorSuite(new SeededRng(42), cfg);
    const b = new SensorSuite(new SeededRng(42), cfg);
    const samples: number[] = [];
    for (let i = 0; i < 20000; i++) {
      const ra = a.imu(level(), Vec3.ZERO);
      const rb = b.imu(level(), Vec3.ZERO);
      expect(ra.accel.x).toBe(rb.accel.x); // deterministic
      samples.push(ra.accel.x); // mean 0 (no bias), std = accelNoise
    }
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    const std = Math.sqrt(samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length);
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.abs(std - DEFAULT_SENSOR_CONFIG.accelNoise)).toBeLessThan(0.02);
  });

  it("GPS fires at the configured rate, not every step", () => {
    const s = new SensorSuite(new SeededRng(1), { ...DEFAULT_SENSOR_CONFIG, gpsRateHz: 5 });
    let fixes = 0;
    for (let i = 0; i < 100; i++) if (s.gps(level(), 0.01)) fixes++; // 1 s at dt=0.01
    expect(fixes).toBeGreaterThanOrEqual(4);
    expect(fixes).toBeLessThanOrEqual(6);
  });

  it("barometer tracks altitude within a few sigma", () => {
    const s = new SensorSuite(new SeededRng(2));
    const alt = s.baro(level(), 0.01);
    expect(Math.abs(alt - 3)).toBeLessThan(1.0);
  });
});
