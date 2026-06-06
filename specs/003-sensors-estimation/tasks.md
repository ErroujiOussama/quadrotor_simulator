# Tasks: Sensor Suite & State Estimation

**Feature ID:** 003-sensors-estimation · **Plan:** ./plan.md

## Legend
`[ ]` todo · `[~]` in progress · `[x]` done · `(P)` parallelizable

## Tasks
- [x] **T1.** `sensors/Sensors.ts` — `SensorConfig`, IMU/GPS/baro/mag, `SensorSuite`.
- [x] **T2.** `estimation/StateEstimator.ts` — Mahony attitude + per-axis KF.
- [x] **T3.** Tests: sensor std-dev + determinism (AC3); attitude RMS (AC1);
  position error (AC2); convergence from a tilted start.
- [x] **T4.** Export from `src/core/index.ts`.
- [x] **T5.** Wire `Simulation`: `EstimationConfig`, sample sensors → estimator
  (own forked RNG → no perturbation of the control loop), add `estimated` +
  `estimationError` to telemetry. Disabled ⇒ identical to spec 002 (AC5).
- [x] **T6.** UI: "EKF" toggle in the command bar + estimation inspector card
  (estimated state + est-vs-true position/attitude error).

## Validation gate
- [x] Sensor noise correct + deterministic (AC3)
- [x] Attitude RMS < 3° in hover (AC1); position error < 1 m (AC2)
- [x] Estimation runs without changing the (truth-based) control loop (AC5)
- [x] Typecheck + lint clean; 65 tests pass; build OK

## Deferred (needs a full gyro-bias EKF — future spec)
- **AC4 fly-on-estimate (closed loop):** accel-only attitude aiding diverges
  under sustained acceleration (the drone drifts → never near 1 g → gravity
  reference is corrupted). Shipped estimation as **display/analysis only**; the
  validated control loop still flies on true state. A proper error-state EKF
  (with gyro-bias estimation) is the prerequisite to close the loop.
