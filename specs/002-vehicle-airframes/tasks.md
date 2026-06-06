# Tasks: Vehicle Plugin System & Multi-Airframe

**Feature ID:** 002-vehicle-airframes · **Plan:** ./plan.md

## Legend
`[ ]` todo · `[~]` in progress · `[x]` done · `(P)` parallelizable

## Tasks
- [x] **T1.** `vehicles/Vehicle.ts` — `Vehicle` interface.
- [x] **T2.** `vehicles/airframes.ts` — `RotorDef`, `AirframeSpec`, geometry-derived
  mixer, wrench fn, presets (quad-X, quad-+, hexa-X, octo-X).
- [x] **T3.** `vehicles/RotorCraft.ts` — generalized N-rotor `Vehicle` impl.
- [x] **T4.** Tests: mixer/wrench sign consistency (AC1), hover per airframe (AC2),
  torque sign (AC3), hover thrust = weight (AC4), determinism (AC5).
- [x] **T5.** Export new API from `src/core/index.ts`.
- [x] **T6.** Migrate `Simulation` to `RotorCraft` + airframe mixer; `FlightController.axes()`;
  `setAirframe` runtime switch. (Position-hold + determinism tests still pass on quad.)
- [x] **T7.** Generalize telemetry to N motors (`SimulationData.motorThrottles`/`motorSpeeds`,
  `airframe` id); update FPV HUD, telemetry inspector, charts, CSV export.
- [x] **T8.** UI airframe selector in the command bar (quad-X/+, hexa-X, octo-X).

## Validation gate
- [x] Mixer/wrench sign-consistent → controllable (AC1, redefined from legacy parity)
- [x] quad-X/+, hexa-X, octo-X hold hover (AC2) and thrust=weight (AC4)
- [x] Torque-sign consistency (AC3); determinism (AC5)
- [x] Simulation flies hexa + switches airframe at runtime; quad behavior preserved
- [x] Typecheck + lint clean; 54 tests pass; build OK

## Deferred to a later feature
- N-rotor 3D model (the viewport still renders the quad mesh for all airframes).
- N-motor failure UI (only the first 4 rotors are individually failable today).
