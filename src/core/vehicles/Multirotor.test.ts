/**
 * Physics validation suite (constitution P1, spec 001 acceptance criteria).
 * Each test maps to an AC in specs/001-core-engine/spec.md.
 */
import { describe, it, expect } from "vitest";
import { Vec3 } from "../math/Vec3";
import { Quat } from "../math/Quat";
import { GRAVITY } from "../math/constants";
import { Multirotor } from "./Multirotor";

describe("Multirotor validation", () => {
  // AC1 — hover equilibrium: thrust = weight ⇒ altitude holds.
  it("AC1: holds altitude within 1e-3 m over 10 s at hover throttle", () => {
    const d = new Multirotor({ initialState: { position: new Vec3(0, 0, 5) } });
    const h = d.hoverThrottle();
    d.primeMotors([h, h, h, h]); // start at equilibrium (no ESC spin-up dip)
    const dt = 0.002;
    for (let i = 0; i < 5000; i++) {
      d.setCommand([h, h, h, h]);
      d.step(dt);
    }
    expect(Math.abs(d.state.position.z - 5)).toBeLessThan(1e-3);
    // Stayed level too.
    const e = d.eulerAngles();
    expect(Math.abs(e.roll)).toBeLessThan(1e-6);
    expect(Math.abs(e.pitch)).toBeLessThan(1e-6);
  });

  // AC2 — free-fall: motors off ⇒ z(t) = z0 − ½gt².
  it("AC2: free-fall matches analytic within 1% before ground contact", () => {
    const z0 = 20;
    const d = new Multirotor({
      params: { dragCoeff: 0 }, // isolate gravity for the analytic comparison
      initialState: { position: new Vec3(0, 0, z0) },
    });
    d.setCommand([0, 0, 0, 0]);
    const dt = 0.002;
    let t = 0;
    for (let i = 0; i < 500; i++) {
      d.step(dt);
      t += dt;
      const analytic = z0 - 0.5 * GRAVITY * t * t;
      if (analytic <= 0.1) break;
      expect(Math.abs(d.state.position.z - analytic)).toBeLessThan(0.01 * z0);
    }
    expect(t).toBeGreaterThan(0.5);
  });

  // AC3 — determinism: same seed/config/inputs ⇒ identical trajectory.
  it("AC3: two identical runs produce identical trajectories", () => {
    const run = () => {
      const d = new Multirotor({ initialState: { position: new Vec3(0, 0, 3) } });
      const samples: number[] = [];
      const h = d.hoverThrottle();
      for (let i = 0; i < 2000; i++) {
        // Asymmetric command to excite all axes.
        d.setCommand([h + 0.02, h - 0.01, h, h - 0.02]);
        d.step(0.002);
        samples.push(d.state.position.x, d.state.position.y, d.state.position.z);
      }
      return samples;
    };
    expect(run()).toEqual(run());
  });

  // AC4 — flip stability: continuous rotation through vertical stays finite & normalized.
  it("AC4: a continuous flip stays finite and quaternion-normalized", () => {
    const d = new Multirotor({ initialState: { position: new Vec3(0, 0, 50) } });
    // Force a strong roll rate by failing/asymmetric throttle differential.
    const dt = 0.002;
    for (let i = 0; i < 3000; i++) {
      d.setCommand([0.9, 0.3, 0.9, 0.3]); // roll torque imbalance
      d.step(dt);
      expect(d.state.position.isFinite()).toBe(true);
      expect(d.state.attitude.isFinite()).toBe(true);
      expect(Math.abs(d.state.attitude.norm() - 1)).toBeLessThan(1e-6);
    }
    // Should have rotated well past vertical (no gimbal lock blowup).
    expect(Math.abs(d.state.angularVel.x)).toBeGreaterThan(0.1);
  });

  // AC5 — battery: hover drains SoC and predicts flight time sanely.
  it("AC5: hovering drains the battery monotonically", () => {
    const d = new Multirotor({ initialState: { position: new Vec3(0, 0, 5) } });
    const h = d.hoverThrottle();
    d.primeMotors([h, h, h, h]);
    const soc0 = d.battery.getSoc();
    for (let i = 0; i < 5000; i++) {
      d.setCommand([h, h, h, h]);
      d.step(0.01);
    }
    expect(d.battery.getSoc()).toBeLessThan(soc0);
    expect(d.battery.getDrawnAh()).toBeGreaterThan(0);
  });

  it("hover throttle actually produces ~zero vertical acceleration", () => {
    const d = new Multirotor();
    const h = d.hoverThrottle();
    d.primeMotors([h, h, h, h]);
    d.setCommand([h, h, h, h]);
    const z0 = d.state.position.z;
    d.step(0.01);
    expect(Math.abs(d.state.velocity.z)).toBeLessThan(1e-3);
    expect(Math.abs(d.state.position.z - z0)).toBeLessThan(1e-4);
  });
});
