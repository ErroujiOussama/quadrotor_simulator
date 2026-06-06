import { describe, it, expect } from "vitest";
import { SimEngine } from "./SimEngine";

describe("SimEngine (worker logic, runs headless)", () => {
  it("initializes and reports ready", () => {
    const e = new SimEngine();
    expect(e.handle({ t: "init", seed: 1 })).toEqual([{ t: "ready" }]);
    expect(e.isRunning()).toBe(false);
  });

  it("does not advance while paused", () => {
    const e = new SimEngine();
    e.handle({ t: "init", seed: 1 });
    expect(e.advance(1000, 1000, 30)).toBeNull();
  });

  it("advances and emits throttled snapshots when running", () => {
    const e = new SimEngine();
    e.handle({ t: "init", seed: 1 });
    e.handle({ t: "setFlightMode", mode: "position_hold" });
    e.handle({ t: "setSetpoints", setpoints: { position: { x: 0, y: 0, z: 3 } } });
    e.handle({ t: "start" });

    // Simulate ~2 s of wall clock in 33 ms ticks.
    let snapshots = 0;
    let now = 0;
    for (let i = 0; i < 60; i++) {
      now += 33;
      const out = e.advance(33, now, 30);
      if (out && out.t === "snapshot") snapshots++;
    }
    expect(snapshots).toBeGreaterThan(0);
    // The sim should have climbed toward the setpoint.
    expect(e.getSimulation().getEulerState().position.z).toBeGreaterThan(0.5);
  });

  it("pause emits a stopped message and halts advancement", () => {
    const e = new SimEngine();
    e.handle({ t: "init", seed: 1 });
    e.handle({ t: "start" });
    expect(e.handle({ t: "pause" })).toEqual([{ t: "stopped" }]);
    expect(e.advance(100, 100, 30)).toBeNull();
  });
});
