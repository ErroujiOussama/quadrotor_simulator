/**
 * Physical and numerical constants. SI units throughout (constitution Article III).
 */

/** Standard gravity at sea level (m/s²). */
export const GRAVITY = 9.80665;

/** Sea-level ISA air density (kg/m³). */
export const RHO_SEA_LEVEL = 1.225;

/** Sea-level ISA temperature (K). */
export const T_SEA_LEVEL = 288.15;

/** Sea-level ISA pressure (Pa). */
export const P_SEA_LEVEL = 101325;

/** Temperature lapse rate in the troposphere (K/m). */
export const LAPSE_RATE = 0.0065;

/** Specific gas constant for dry air (J/(kg·K)). */
export const R_AIR = 287.058;

/** A small epsilon for guarding divisions and singularities. */
export const EPS = 1e-9;

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/** Linear interpolation. t is not clamped. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
