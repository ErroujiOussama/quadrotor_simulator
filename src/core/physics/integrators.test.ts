import { describe, it, expect } from "vitest";
import { Vec3 } from "../math/Vec3";
import { Quat } from "../math/Quat";
import { BodyState, Derivative } from "./state";
import { rk4, rk45, semiImplicit } from "./integrators";

const rest = (): BodyState => ({
  position: Vec3.ZERO,
  velocity: Vec3.ZERO,
  attitude: Quat.IDENTITY,
  angularVel: Vec3.ZERO,
});

describe("integrators", () => {
  // Constant downward acceleration: analytic x = ½at², v = at.
  it("RK4 is exact for constant acceleration (free-fall)", () => {
    const a = -9.80665;
    const f = (): Derivative => ({
      dPos: undefined as never, // replaced below
      dVel: new Vec3(0, 0, a),
      dQuat: Quat.IDENTITY.derivative(Vec3.ZERO),
      dOmega: Vec3.ZERO,
    });
    // dPos must equal current velocity; wrap to inject it per-state.
    const deriv = (s: BodyState): Derivative => ({ ...f(), dPos: s.velocity });

    let s = rest();
    const dt = 0.01;
    for (let i = 0; i < 100; i++) s = rk4(s, deriv, dt); // t = 1 s
    expect(s.position.z).toBeCloseTo(0.5 * a * 1, 6); // ½·a·t² with t=1
    expect(s.velocity.z).toBeCloseTo(a * 1, 6);
  });

  it("all integrators agree on a harmonic oscillator within tolerance", () => {
    // ẍ = −x  → x(t) = cos(t), starting x=1, v=0. Encode x in position.x, v in velocity.x.
    const deriv = (s: BodyState): Derivative => ({
      dPos: new Vec3(s.velocity.x, 0, 0),
      dVel: new Vec3(-s.position.x, 0, 0),
      dQuat: Quat.IDENTITY.derivative(Vec3.ZERO),
      dOmega: Vec3.ZERO,
    });
    const run = (integ: typeof rk4) => {
      let s: BodyState = { ...rest(), position: new Vec3(1, 0, 0) };
      const dt = 0.001;
      for (let i = 0; i < 1000; i++) s = integ(s, deriv, dt); // t = 1
      return s.position.x;
    };
    const analytic = Math.cos(1);
    expect(run(rk4)).toBeCloseTo(analytic, 4);
    expect(run(rk45)).toBeCloseTo(analytic, 4);
    expect(run(semiImplicit)).toBeCloseTo(analytic, 2);
  });

  it("renormalizes attitude during rotation (|q| = 1)", () => {
    const omega = new Vec3(0, 0, 2); // spin about Z
    const deriv = (s: BodyState): Derivative => ({
      dPos: Vec3.ZERO,
      dVel: Vec3.ZERO,
      dQuat: s.attitude.derivative(omega),
      dOmega: Vec3.ZERO,
    });
    let s = { ...rest(), angularVel: omega };
    for (let i = 0; i < 5000; i++) s = rk4(s, deriv, 0.002);
    expect(Math.abs(s.attitude.norm() - 1)).toBeLessThan(1e-9);
  });
});
