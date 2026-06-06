# Tasks: Vehicle Plugin System & Multi-Airframe

**Feature ID:** 002-vehicle-airframes · **Plan:** ./plan.md

## Legend
`[ ]` todo · `[~]` in progress · `[x]` done · `(P)` parallelizable

## Tasks
- [ ] **T1.** `vehicles/Vehicle.ts` — `Vehicle` interface.
- [ ] **T2.** `vehicles/airframes.ts` — `RotorDef`, `AirframeSpec`, mixer fn,
  geometry torque fn, presets (quad-X, quad-+, hexa-X, octo-X).
- [ ] **T3.** `vehicles/RotorCraft.ts` — generalized N-rotor `Vehicle` impl.
- [ ] **T4.** Tests: mixer parity (AC1), hover per airframe (AC2), torque sign
  (AC3), hover thrust = weight (AC4), determinism (AC5).
- [ ] **T5.** Export new API from `src/core/index.ts`.

## Validation gate
- [ ] Quad-X mixer matches legacy formula (AC1)
- [ ] quad-X/+, hexa-X, octo-X hold hover (AC2) and thrust=weight (AC4)
- [ ] Torque-sign consistency (AC3); determinism (AC5)
- [ ] Typecheck + lint clean; core boundary holds
