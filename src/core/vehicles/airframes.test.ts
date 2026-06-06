import { describe, it, expect } from "vitest";
import { buildAirframe, mixToThrottles, rotorWrench, AIRFRAME_TYPES } from "./airframes";

describe("airframes", () => {
  // AC1 — quad-X mixer reproduces the legacy FL/FR/RL/RR controller formula.
  it("AC1: quad-X mixer matches the legacy motor mix formula", () => {
    const af = buildAirframe("quad_x", 0.25);
    // Legacy: M1 base+p−r+y, M2 base+p+r−y, M3 base−p−r−y, M4 base−p+r+y
    const cases = [
      { base: 0.5, roll: 0.1, pitch: 0.05, yaw: -0.03 },
      { base: 0.6, roll: -0.2, pitch: 0.15, yaw: 0.08 },
      { base: 0.4, roll: 0.0, pitch: 0.0, yaw: 0.0 },
    ];
    for (const { base, roll, pitch, yaw } of cases) {
      const got = mixToThrottles(af, base, roll, pitch, yaw);
      const legacy = [
        base + pitch - roll + yaw,
        base + pitch + roll - yaw,
        base - pitch - roll - yaw,
        base - pitch + roll + yaw,
      ].map((v) => Math.max(0, Math.min(1, v)));
      for (let i = 0; i < 4; i++) expect(got[i]).toBeCloseTo(legacy[i], 12);
    }
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
