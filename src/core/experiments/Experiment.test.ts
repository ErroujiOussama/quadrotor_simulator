import { describe, it, expect } from "vitest";
import { runExperiment, ExperimentSpec } from "./Experiment";
import {
  HOVER_STABILITY, ALTITUDE_STEP, WIND_REJECTION, MOTOR_FAILURE_RECOVERY, EXPERIMENTS,
} from "./presets";

describe("Experiment lab", () => {
  it("AC1: hover stability scores well and doesn't crash", () => {
    const r = runExperiment(HOVER_STABILITY);
    expect(r.scorecard.crashed).toBe(false);
    expect(r.scorecard.positionRMSE).toBeLessThan(0.2);
    expect(r.scorecard.score).toBeGreaterThanOrEqual(80);
  });

  it("AC2: altitude step reports rise time and settling time", () => {
    const r = runExperiment(ALTITUDE_STEP);
    expect(r.scorecard.altitudeRiseTime).not.toBeNull();
    expect(r.scorecard.altitudeSettlingTime).not.toBeNull();
  });

  it("AC3: wind rejection stays bounded with a finite score", () => {
    const r = runExperiment(WIND_REJECTION);
    expect(r.scorecard.crashed).toBe(false);
    expect(Number.isFinite(r.scorecard.score)).toBe(true);
    expect(r.scorecard.positionRMSE).toBeLessThan(2);
  });

  it("AC4: deterministic — same experiment+seed ⇒ identical scorecard", () => {
    const a = runExperiment(HOVER_STABILITY).scorecard;
    const b = runExperiment(HOVER_STABILITY).scorecard;
    expect(a).toEqual(b);
  });

  it("AC5: a crashing experiment is flagged and scores 0", () => {
    const crashSpec: ExperimentSpec = {
      id: "crash", name: "Crash", description: "all motors fail mid-air → falls",
      seed: 1, durationS: 9,
      setup: (sim) => {
        sim.setFlightMode("position_hold");
        sim.setSetpoints({ position: { x: 0, y: 0, z: 5 } });
      },
      events: [
        { t: 5, apply: (sim) => sim.setFailures({ motorFailures: [true, true, true, true] }) },
      ],
    };
    const r = runExperiment(crashSpec);
    expect(r.scorecard.crashed).toBe(true);
    expect(r.scorecard.score).toBe(0);
  });

  it("motor-failure experiment runs and produces a finite scorecard", () => {
    const r = runExperiment(MOTOR_FAILURE_RECOVERY);
    expect(Number.isFinite(r.scorecard.positionRMSE)).toBe(true);
    expect(Number.isFinite(r.scorecard.score)).toBe(true);
    expect(r.history.length).toBeGreaterThan(0);
  });

  it("AC6: runs headless in Node (no browser globals)", () => {
    expect(typeof window).toBe("undefined");
    for (const spec of EXPERIMENTS) {
      const r = runExperiment({ ...spec, durationS: 3 }); // short smoke run
      expect(r.history.length).toBeGreaterThan(0);
      expect(Number.isFinite(r.scorecard.score)).toBe(true);
    }
  });
});
