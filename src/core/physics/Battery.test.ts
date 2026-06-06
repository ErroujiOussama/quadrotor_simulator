import { describe, it, expect } from "vitest";
import { Battery, DEFAULT_BATTERY } from "./Battery";

describe("Battery", () => {
  it("starts full and reports a 4S full-pack voltage near 16.8 V", () => {
    const b = new Battery(DEFAULT_BATTERY, 1);
    expect(b.getSoc()).toBe(1);
    expect(b.openCircuitVoltage()).toBeCloseTo(4.2 * 4, 5);
  });

  it("drains SoC monotonically under load (AC5)", () => {
    const b = new Battery(DEFAULT_BATTERY, 1);
    let prev = b.getSoc();
    for (let t = 0; t < 60; t++) {
      b.update(20, 1); // 20 A for 1 s
      expect(b.getSoc()).toBeLessThanOrEqual(prev);
      prev = b.getSoc();
    }
    expect(b.getSoc()).toBeLessThan(1);
  });

  it("sags under load: terminal voltage < open-circuit", () => {
    const b = new Battery({ ...DEFAULT_BATTERY, internalOhm: 0.02 }, 1);
    b.update(50, 0.01);
    const sag = b.openCircuitVoltage() - b.voltage();
    expect(sag).toBeCloseTo(50 * 0.02, 6); // I·R
    expect(b.voltage()).toBeLessThan(b.openCircuitVoltage());
  });

  it("conserves charge: drawnAh matches integral of current", () => {
    const b = new Battery(DEFAULT_BATTERY, 1);
    // 10 A for 360 s = 1 Ah
    for (let i = 0; i < 360; i++) b.update(10, 1);
    expect(b.getDrawnAh()).toBeCloseTo(1.0, 6);
    expect(b.getSoc()).toBeCloseTo(1 - 1.0 / DEFAULT_BATTERY.capacityAh, 6);
  });

  it("flight-time estimate is within 10% of integrated energy draw (AC5)", () => {
    const current = 30; // A, steady
    const b = new Battery(DEFAULT_BATTERY, 1);
    const predicted = b.flightTimeEstimateS(current); // at full charge, with 5% reserve

    // Now actually drain until 5% reserve and time it.
    let elapsed = 0;
    while (b.getSoc() > 0.05 && elapsed < 100000) {
      b.update(current, 0.1);
      elapsed += 0.1;
    }
    const ratio = elapsed / predicted;
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1.1);
  });

  it("never goes below empty", () => {
    const b = new Battery(DEFAULT_BATTERY, 0.01);
    b.update(100, 100);
    expect(b.getSoc()).toBe(0);
    expect(b.voltage()).toBeGreaterThanOrEqual(0);
  });
});
