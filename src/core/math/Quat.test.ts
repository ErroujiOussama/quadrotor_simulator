import { describe, it, expect } from "vitest";
import { Quat } from "./Quat";
import { Vec3 } from "./Vec3";

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("Quat", () => {
  it("identity rotates nothing", () => {
    const v = new Vec3(1, 2, 3);
    const r = Quat.IDENTITY.rotate(v);
    expect(r.toArray()).toEqual([1, 2, 3]);
  });

  it("round-trips through Euler angles", () => {
    const roll = 0.3, pitch = -0.45, yaw = 1.2;
    const e = Quat.fromEuler(roll, pitch, yaw).toEuler();
    close(e.roll, roll, 1e-6);
    close(e.pitch, pitch, 1e-6);
    close(e.yaw, yaw, 1e-6);
  });

  it("rotates a vector 90° about Z (yaw): x → y", () => {
    const q = Quat.fromEuler(0, 0, Math.PI / 2);
    const r = q.rotate(Vec3.UNIT_X);
    close(r.x, 0, 1e-9);
    close(r.y, 1, 1e-9);
    close(r.z, 0, 1e-9);
  });

  it("rotate then inverse-rotate is identity", () => {
    const q = Quat.fromEuler(0.4, 0.5, -0.6);
    const v = new Vec3(2, -3, 1.5);
    const back = q.rotateInverse(q.rotate(v));
    close(back.x, v.x, 1e-9);
    close(back.y, v.y, 1e-9);
    close(back.z, v.z, 1e-9);
  });

  it("stays normalized after composing many rotations (no gimbal lock drift)", () => {
    let q = Quat.IDENTITY;
    const step = Quat.fromAxisAngle(new Vec3(1, 1, 1), 0.1);
    for (let i = 0; i < 1000; i++) q = q.mul(step).normalize();
    close(q.norm(), 1, 1e-9);
  });

  it("handles pitch at the +90° pole without NaN", () => {
    const e = Quat.fromEuler(0, Math.PI / 2, 0).toEuler();
    expect(Number.isFinite(e.roll)).toBe(true);
    expect(Number.isFinite(e.pitch)).toBe(true);
    expect(Number.isFinite(e.yaw)).toBe(true);
    close(e.pitch, Math.PI / 2, 1e-6);
  });
});
