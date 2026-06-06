import { describe, it, expect } from "vitest";
import { Vec3 } from "../math/Vec3";
import { GRAVITY } from "../math/constants";
import { RotorCraft } from "./RotorCraft";
import { buildAirframe, AIRFRAME_TYPES, AirframeType } from "./airframes";

const make = (type: AirframeType, z = 5) =>
  new RotorCraft({ airframe: buildAirframe(type, 0.25), initialState: { position: new Vec3(0, 0, z) } });

describe("RotorCraft validation", () => {
  // AC2 — every preset holds altitude at hover throttle (symmetric → no torque).
  it("AC2: quad-X/+, hexa-X, octo-X hold altitude at hover throttle", () => {
    for (const { type } of AIRFRAME_TYPES) {
      const d = make(type, 5);
      const h = d.hoverThrottle();
      d.primeMotors(new Array(d.actuatorCount).fill(h));
      for (let i = 0; i < 4000; i++) {
        d.setCommand(new Array(d.actuatorCount).fill(h));
        d.step(0.0025);
      }
      expect(Math.abs(d.state.position.z - 5)).toBeLessThan(1e-2);
      const e = d.eulerAngles();
      expect(Math.abs(e.roll)).toBeLessThan(1e-4);
      expect(Math.abs(e.pitch)).toBeLessThan(1e-4);
    }
  });

  // AC4 — hover thrust equals weight for each preset.
  it("AC4: total hover thrust equals weight", () => {
    for (const { type } of AIRFRAME_TYPES) {
      const d = make(type);
      const h = d.hoverThrottle();
      const totalThrust = h * d.actuatorCount * d.getParams().maxThrustPerMotor;
      expect(totalThrust).toBeCloseTo(d.getParams().mass * GRAVITY, 6);
    }
  });

  // AC5 — determinism.
  it("AC5: identical runs match bit-for-bit", () => {
    const run = () => {
      const d = make("hexa_x", 3);
      const h = d.hoverThrottle();
      const samples: number[] = [];
      for (let i = 0; i < 1500; i++) {
        const cmd = new Array(d.actuatorCount).fill(h);
        cmd[0] += 0.03; // excite asymmetry
        d.setCommand(cmd);
        d.step(0.0025);
        samples.push(d.state.position.x, d.state.position.z, d.state.attitude.toEuler().roll);
      }
      return samples;
    };
    expect(run()).toEqual(run());
  });

  it("octo has 8 actuators, hexa 6, quad 4", () => {
    expect(make("octo_x").actuatorCount).toBe(8);
    expect(make("hexa_x").actuatorCount).toBe(6);
    expect(make("quad_x").actuatorCount).toBe(4);
  });

  it("drains battery while flying", () => {
    const d = make("quad_x");
    const h = d.hoverThrottle();
    d.primeMotors(new Array(4).fill(h));
    const soc0 = d.battery.getSoc();
    for (let i = 0; i < 2000; i++) { d.setCommand(new Array(4).fill(h)); d.step(0.01); }
    expect(d.battery.getSoc()).toBeLessThan(soc0);
  });
});
