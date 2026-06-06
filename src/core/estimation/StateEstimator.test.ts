import { describe, it, expect } from "vitest";
import { Vec3 } from "../math/Vec3";
import { Quat } from "../math/Quat";
import { SeededRng } from "../rng/SeededRng";
import { SensorSuite, DEFAULT_SENSOR_CONFIG } from "../sensors/Sensors";
import { StateEstimator } from "./StateEstimator";
import type { BodyState } from "../physics/state";

const RAD2DEG = 180 / Math.PI;

const hover = (): BodyState => ({
  position: new Vec3(1, 2, 3),
  velocity: Vec3.ZERO,
  attitude: Quat.IDENTITY,
  angularVel: Vec3.ZERO,
});

/** Run sensors → estimator against a static hover truth; return accumulated error. */
function runHover(seed: number) {
  const rng = new SeededRng(seed);
  const suite = new SensorSuite(rng, DEFAULT_SENSOR_CONFIG);
  const truth = hover();
  const est = new StateEstimator({ position: truth.position, attitude: truth.attitude });
  const dt = 0.01;
  let attSq = 0, posSq = 0, count = 0;
  for (let i = 0; i < 3000; i++) {
    const imu = suite.imu(truth, Vec3.ZERO); // static → zero inertial accel
    est.setMagYaw(suite.mag(truth));
    est.predict(imu, dt);
    const gps = suite.gps(truth, dt);
    if (gps) est.fuseGps(gps);
    est.fuseBaro(suite.baro(truth, dt));
    if (i > 1500) {
      const e = est.getState();
      const eul = e.attitude.toEuler();
      attSq += eul.roll ** 2 + eul.pitch ** 2 + eul.yaw ** 2;
      posSq += e.position.sub(truth.position).lengthSq();
      count++;
    }
  }
  return { attRmsDeg: Math.sqrt(attSq / (count * 3)) * RAD2DEG, posRms: Math.sqrt(posSq / count), est };
}

describe("StateEstimator", () => {
  it("AC1: estimated attitude tracks truth within 3° RMS in hover", () => {
    expect(runHover(1).attRmsDeg).toBeLessThan(3);
  });

  it("AC2: estimated position tracks truth within ~GPS noise (< 1 m RMS)", () => {
    expect(runHover(7).posRms).toBeLessThan(1.0);
  });

  it("AC3: deterministic for a given seed", () => {
    const a = runHover(5).est.getState();
    const b = runHover(5).est.getState();
    expect(a.position.toArray()).toEqual(b.position.toArray());
    expect(a.attitude.toObject()).toEqual(b.attitude.toObject());
  });

  it("converges attitude from a wrong initial guess", () => {
    const rng = new SeededRng(3);
    const suite = new SensorSuite(rng, { ...DEFAULT_SENSOR_CONFIG, gyroBias: Vec3.ZERO, accelBias: Vec3.ZERO, accelNoise: 0, gyroNoise: 0, magNoise: 0 });
    const truth = hover();
    // Start tilted 20° in roll; filter should pull it back toward level.
    const est = new StateEstimator({ position: truth.position, attitude: Quat.fromEuler(0.35, 0, 0) });
    for (let i = 0; i < 2000; i++) {
      est.setMagYaw(suite.mag(truth));
      est.predict(suite.imu(truth, Vec3.ZERO), 0.01);
    }
    expect(Math.abs(est.getState().attitude.toEuler().roll)).toBeLessThan(0.02);
  });
});
