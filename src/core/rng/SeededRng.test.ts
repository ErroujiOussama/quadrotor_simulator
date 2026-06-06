import { describe, it, expect } from "vitest";
import { SeededRng } from "./SeededRng";

describe("SeededRng", () => {
  it("is deterministic for a given seed (constitution P2 / AC3)", () => {
    const a = new SeededRng(42);
    const b = new SeededRng(42);
    const seqA = Array.from({ length: 1000 }, () => a.next());
    const seqB = Array.from({ length: 1000 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different streams for different seeds", () => {
    const a = new SeededRng(1);
    const b = new SeededRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it("stays in [0,1)", () => {
    const r = new SeededRng(7);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("gaussian has ~0 mean and ~1 std over many samples", () => {
    const r = new SeededRng(123);
    const n = 100000;
    let sum = 0, sumSq = 0;
    for (let i = 0; i < n; i++) {
      const g = r.gaussian();
      sum += g;
      sumSq += g * g;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.02);
  });

  it("fork produces an independent but deterministic stream", () => {
    const r1 = new SeededRng(99);
    const f1 = r1.fork().next();
    const r2 = new SeededRng(99);
    const f2 = r2.fork().next();
    expect(f1).toBe(f2);
  });

  it("can save and restore state (replay)", () => {
    const r = new SeededRng(55);
    r.next(); r.next();
    const state = r.getState();
    const after = [r.next(), r.next(), r.next()];
    r.setState(state);
    expect([r.next(), r.next(), r.next()]).toEqual(after);
  });
});
