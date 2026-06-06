/**
 * Deterministic, seedable PRNG (constitution P2). The entire simulation core
 * draws randomness from here — never from Math.random — so that a given
 * {seed, config, inputs} reproduces a run bit-for-bit.
 *
 * Algorithm: mulberry32. Tiny, fast, good statistical quality for simulation
 * noise, and trivially reproducible across V8 versions.
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number;
  /** Standard normal (mean 0, std 1). */
  gaussian(): number;
  /** A new independent stream derived deterministically from this one. */
  fork(): Rng;
  /** Current internal state (for serialization / RunRecord). */
  getState(): number;
}

export class SeededRng implements Rng {
  private state: number;
  // Cache for the Box–Muller pair so we don't waste a draw.
  private spareGaussian: number | null = null;

  constructor(seed = 0x9e3779b9) {
    // Normalize to uint32 and avoid the degenerate 0 state.
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  next(): number {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  gaussian(): number {
    if (this.spareGaussian !== null) {
      const v = this.spareGaussian;
      this.spareGaussian = null;
      return v;
    }
    // Box–Muller; guard u away from 0 so log is finite.
    let u = this.next();
    if (u < 1e-12) u = 1e-12;
    const v = this.next();
    const mag = Math.sqrt(-2 * Math.log(u));
    this.spareGaussian = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  }

  fork(): Rng {
    // Derive a new seed deterministically by hashing the current state.
    const s = (Math.imul(this.state ^ 0x85ebca6b, 0xc2b2ae35) >>> 0);
    // Advance our own state so repeated forks differ.
    this.next();
    return new SeededRng(s);
  }

  getState(): number {
    return this.state;
  }

  /** Restore a previously captured state (replay). */
  setState(state: number): void {
    this.state = state >>> 0;
    this.spareGaussian = null;
  }
}
