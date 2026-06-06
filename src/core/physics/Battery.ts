/**
 * Li-Po battery model with a state-of-charge-dependent open-circuit voltage
 * curve and internal-resistance sag under load. Lets students see how energy
 * limits flight time and how voltage droops as current rises (constitution P7).
 *
 * Model:
 *   V_terminal = V_oc(SoC) − I · R_internal
 *   SoC drains by integrating drawn charge against pack capacity.
 *
 * All quantities SI/engineering standard: volts, amps, ohms, amp-hours.
 */
import { clamp } from "../math/constants";

export interface BatterySpec {
  /** Number of series cells (e.g. 4 = "4S"). */
  cells: number;
  /** Pack capacity in amp-hours (e.g. 5.2 Ah = 5200 mAh). */
  capacityAh: number;
  /** Internal resistance of the whole pack (ohms). */
  internalOhm: number;
  /** Continuous discharge rating (C). Used for current-limit warnings. */
  cRating: number;
}

/** Sensible default: a 4S 5200 mAh pack, ~10 mΩ, 30C. */
export const DEFAULT_BATTERY: BatterySpec = {
  cells: 4,
  capacityAh: 5.2,
  internalOhm: 0.01,
  cRating: 30,
};

/**
 * Per-cell open-circuit voltage as a function of state of charge [0,1].
 * Piecewise-linear fit of a typical Li-Po discharge curve: 4.2 V full,
 * a long ~3.7 V plateau, steep knee below ~10%.
 */
function cellOcv(soc: number): number {
  const s = clamp(soc, 0, 1);
  const pts: [number, number][] = [
    [0.0, 3.30],
    [0.05, 3.50],
    [0.1, 3.65],
    [0.2, 3.73],
    [0.5, 3.85],
    [0.8, 4.02],
    [1.0, 4.20],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    const [s0, v0] = pts[i];
    const [s1, v1] = pts[i + 1];
    if (s <= s1) {
      const t = (s - s0) / (s1 - s0);
      return v0 + (v1 - v0) * t;
    }
  }
  return pts[pts.length - 1][1];
}

export class Battery {
  private spec: BatterySpec;
  private soc: number; // state of charge [0,1]
  private lastCurrentA = 0;
  /** Cumulative charge drawn (amp-hours) — for energy accounting. */
  private drawnAh = 0;

  constructor(spec: BatterySpec = DEFAULT_BATTERY, initialSoc = 1) {
    this.spec = { ...spec };
    this.soc = clamp(initialSoc, 0, 1);
  }

  /** Advance the model by dt seconds at a drawn current of `currentA` amps. */
  update(currentA: number, dt: number): void {
    const i = Math.max(0, currentA);
    this.lastCurrentA = i;
    const drawnAhStep = (i * dt) / 3600; // A·s → A·h
    this.drawnAh += drawnAhStep;
    this.soc = clamp(this.soc - drawnAhStep / this.spec.capacityAh, 0, 1);
  }

  /** Open-circuit (no-load) pack voltage at the current SoC. */
  openCircuitVoltage(): number {
    return cellOcv(this.soc) * this.spec.cells;
  }

  /** Terminal voltage under the most recent load (includes IR sag). */
  voltage(): number {
    return Math.max(0, this.openCircuitVoltage() - this.lastCurrentA * this.spec.internalOhm);
  }

  /** Terminal voltage that *would* be seen at a given current draw. */
  voltageAt(currentA: number): number {
    return Math.max(0, this.openCircuitVoltage() - Math.max(0, currentA) * this.spec.internalOhm);
  }

  getSoc(): number {
    return this.soc;
  }

  getDrawnAh(): number {
    return this.drawnAh;
  }

  /** Continuous current limit implied by the C-rating (amps). */
  maxContinuousCurrentA(): number {
    return this.spec.cRating * this.spec.capacityAh;
  }

  /**
   * Estimated remaining flight time (seconds) at a steady current draw,
   * assuming usable capacity down to a 5% reserve.
   */
  flightTimeEstimateS(currentA: number): number {
    const i = Math.max(1e-6, currentA);
    const usableAh = Math.max(0, (this.soc - 0.05) * this.spec.capacityAh);
    return (usableAh / i) * 3600;
  }

  getSpec(): BatterySpec {
    return { ...this.spec };
  }

  reset(initialSoc = 1): void {
    this.soc = clamp(initialSoc, 0, 1);
    this.lastCurrentA = 0;
    this.drawnAh = 0;
  }
}
