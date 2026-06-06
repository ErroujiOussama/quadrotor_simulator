import { describe, it, expect } from "vitest";
import { buildAirframe, mixToThrottles, rotorWrench, AIRFRAME_TYPES } from "./airframes";

describe("airframes", () => {
  // AC1 — the mixer is sign-consistent with the physical wrench: a positive
  // roll/pitch/yaw command produces a positive body torque about X/Y/Z. This is
  // what makes every airframe controllable by the same controller.
  it("AC1: mixer commands produce matching body torques (quad-X)", () => {
    const af = buildAirframe("quad_x", 0.25);
    const kT = 0.016;
    const hover = 0.5;
    const wrenchFor = (roll: number, pitch: number, yaw: number) => {
      const thr = mixToThrottles(af, hover, roll, pitch, yaw).map((t) => t * 7); // N
      return rotorWrench(af, thr, kT).torque;
    };
    expect(wrenchFor(0.1, 0, 0).x).toBeGreaterThan(0); // +roll cmd → +roll torque
    expect(wrenchFor(0, 0.1, 0).y).toBeGreaterThan(0); // +pitch cmd → +pitch torque
    expect(wrenchFor(0, 0, 0.1).z).toBeGreaterThan(0); // +yaw cmd → +yaw torque
  });

  // AC3 — sign consistency: adding thrust to +Y rotors yields a positive roll torque.
  it("AC3: +Y-side thrust produces positive roll torque", () => {
    const af = buildAirframe("quad_x", 0.25);
    // Rotors 0 (FL +Y) and 2 (RL +Y) are on the +Y (left) side.
    const thrusts = af.rotors.map((r) => (r.position.y > 0 ? 2 : 1));
    const { torque } = rotorWrench(af, thrusts, 0.016);
    expect(torque.x).toBeGreaterThan(0); // +roll
  });

  // AC4 (geometry side) — symmetric equal thrust gives zero net torque for all presets.
  it("AC4: symmetric hover thrust yields zero net torque for every preset", () => {
    for (const { type } of AIRFRAME_TYPES) {
      const af = buildAirframe(type, 0.25);
      const thrusts = af.rotors.map(() => 3.0);
      const { thrust, torque } = rotorWrench(af, thrusts, 0.016);
      expect(thrust).toBeCloseTo(3.0 * af.rotorCount, 9);
      expect(Math.abs(torque.x)).toBeLessThan(1e-9);
      expect(Math.abs(torque.y)).toBeLessThan(1e-9);
      expect(Math.abs(torque.z)).toBeLessThan(1e-9); // alternating spins cancel
    }
  });

  it("each preset has matching rotor/mix counts", () => {
    for (const { type } of AIRFRAME_TYPES) {
      const af = buildAirframe(type);
      expect(af.rotors.length).toBe(af.rotorCount);
      expect(af.mix.length).toBe(af.rotorCount);
      af.mix.forEach((row) => expect(row.length).toBe(4));
    }
  });
});
