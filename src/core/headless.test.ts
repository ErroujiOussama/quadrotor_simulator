/**
 * AC6 — the engine runs headless with no browser globals. This test imports the
 * public API barrel and runs a real simulation, asserting that window/document
 * are absent (the Vitest "node" environment provides no DOM). If someone adds a
 * browser dependency to the core, this test (and the ESLint boundary) breaks.
 */
import { describe, it, expect } from "vitest";
import { Simulation, Multirotor, Vec3, Quat, SeededRng, CORE_VERSION } from "./index";

describe("headless core (AC6)", () => {
  it("has no browser globals available", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
  });

  it("runs a full simulation purely in Node", () => {
    const sim = new Simulation({ seed: 1 });
    sim.setFlightMode("position_hold");
    sim.setSetpoints({ position: { x: 1, y: 1, z: 4 } });
    sim.run(3000);
    const d = sim.getCurrentData();
    expect(d).not.toBeNull();
    expect(Number.isFinite(d!.state.position.z)).toBe(true);
  });

  it("exposes the public API surface", () => {
    expect(typeof CORE_VERSION).toBe("string");
    expect(new Multirotor()).toBeInstanceOf(Multirotor);
    expect(new Vec3(1, 2, 3).length()).toBeCloseTo(Math.sqrt(14));
    expect(Quat.IDENTITY.norm()).toBe(1);
    expect(new SeededRng(1).next()).toBe(new SeededRng(1).next());
  });
});
