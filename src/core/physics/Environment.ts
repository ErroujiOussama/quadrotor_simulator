/**
 * Atmospheric environment: steady wind plus Dryden-style colored-noise
 * turbulence. All randomness flows through an injected SeededRng so a run is
 * reproducible (constitution P2).
 */
import { Vec3 } from "../math/Vec3";
import type { Rng } from "../rng/SeededRng";

export interface WindConfig {
  enabled: boolean;
  speed: number;       // m/s
  direction: number;   // radians (0 = +X, π/2 = +Y)
  turbulenceIntensity: number; // 0–1
}

export const DEFAULT_WIND: WindConfig = {
  enabled: false,
  speed: 0,
  direction: 0,
  turbulenceIntensity: 0,
};

export class Environment {
  private wind: WindConfig = { ...DEFAULT_WIND };
  private turbulence = { x: 0, y: 0, z: 0 };
  private readonly turbulenceTau = 0.5; // s

  constructor(private rng: Rng) {}

  setWind(w: Partial<WindConfig>) { this.wind = { ...this.wind, ...w }; }
  getWind(): WindConfig { return { ...this.wind }; }

  /** Advance turbulence state and return the world-frame air velocity (m/s). */
  windVelocity(dt: number): Vec3 {
    if (!this.wind.enabled) {
      this.turbulence = { x: 0, y: 0, z: 0 };
      return Vec3.ZERO;
    }
    const tAlpha = dt / (this.turbulenceTau + dt);
    const sig = this.wind.turbulenceIntensity * 2.5;
    if (sig > 0) {
      // gaussian() is deterministic given the seed.
      this.turbulence.x += tAlpha * (this.rng.gaussian() * sig - this.turbulence.x);
      this.turbulence.y += tAlpha * (this.rng.gaussian() * sig - this.turbulence.y);
      this.turbulence.z += tAlpha * (this.rng.gaussian() * sig * 0.3 - this.turbulence.z);
    }
    return new Vec3(
      Math.cos(this.wind.direction) * this.wind.speed + this.turbulence.x,
      Math.sin(this.wind.direction) * this.wind.speed + this.turbulence.y,
      this.turbulence.z,
    );
  }

  reset() {
    this.turbulence = { x: 0, y: 0, z: 0 };
  }
}
