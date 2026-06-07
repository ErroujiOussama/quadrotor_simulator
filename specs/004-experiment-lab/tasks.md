# Tasks: Experiment & Scoring Lab

**Feature ID:** 004-experiment-lab · **Plan:** ./plan.md

## Legend
`[ ]` todo · `[~]` in progress · `[x]` done

## Tasks
- [x] **T1.** `experiments/Experiment.ts` — `Scorecard`, `ExperimentSpec`,
  `computeScorecard`, `runExperiment` (headless, timed events).
- [x] **T2.** `experiments/presets.ts` — hover stability, altitude step, waypoint
  tracking, wind rejection, motor failure (hexa), sensor-noise robustness.
- [x] **T3.** Tests: hover ≥ 80 (AC1), step metrics (AC2), wind bounded (AC3),
  determinism (AC4), crash → score 0 (AC5), Node headless (AC6).
- [x] **T4.** Export from `src/core/index.ts`.
- [x] **T5.** UI: Experiments panel (run preset → scorecard) + activity-rail entry.

## Validation gate
- [x] Hover ≥ 80 & RMSE < 0.2 m (AC1); step rise/settling non-null (AC2)
- [x] Wind bounded (AC3); deterministic (AC4); crash flagged + score 0 (AC5)
- [x] Runs headless in Node (AC6)
- [x] Typecheck + lint clean; 72 tests pass; build OK

## Note
Motor-failure "recovery" with a fixed mixer is partial (a failed rotor isn't
reallocated); the experiment honestly reports the degraded score. Full recovery
needs control reallocation — a future spec.
