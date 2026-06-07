# Plan: Experiment & Scoring Lab

**Feature ID:** 004-experiment-lab · **Spec:** ./spec.md
**Status:** ready · **Updated:** 2026-06-07

## 1. Approach
New core module `src/core/experiments/`. An experiment is just data + a setup
function over an ordinary `Simulation`; the runner steps it headless for the
duration (applying timed events), then computes a scorecard from the logged
history (which already records per-sample state, setpoints, battery, motors).
Reuses `Simulation.getMetrics()` for the altitude step-response numbers. UI adds
an "Experiments" tool panel that runs a preset and shows the scorecard.

## 2. Architecture & data model
```ts
interface Scorecard {
  durationS: number;
  positionRMSE: number;      // m, state vs logged setpoint
  attitudeRMSE: number;      // rad
  altitudeRiseTime: number | null;
  altitudeSettlingTime: number | null;
  altitudeOvershoot: number | null;   // %
  maxTiltDeg: number;
  energyWh: number;          // from battery drawnAh
  controlEffort: number;     // mean |Δthrottle|/s (smoothness; lower = smoother)
  crashed: boolean;
  completed: boolean;
  score: number;             // 0–100 composite (transparent formula)
}

interface ExperimentEvent { t: number; apply(sim: Simulation): void; }

interface ExperimentSpec {
  id: string; name: string; description: string;
  airframe?: AirframeType;
  seed?: number;
  durationS: number;
  setup(sim: Simulation): void;   // mode, setpoints, wind, failures, gains, waypoints
  events?: ExperimentEvent[];     // e.g. inject a motor failure at t=6 s
}

interface ExperimentResult { spec: ExperimentSpec; scorecard: Scorecard; history: SimulationData[]; }
function runExperiment(spec: ExperimentSpec): ExperimentResult;
```

Scoring (transparent):
- `positionRMSE` = √mean‖pos − setpoint‖² over the steady window (last 60%).
- `attitudeRMSE` = √mean(roll²+pitch²).
- rise/settling/overshoot from `Simulation.getMetrics()`.
- `maxTiltDeg` = max √(roll²+pitch²).
- `energyWh` = batteryᵉⁿᵈ.drawnAh × nominalVoltage.
- `controlEffort` = mean over time of mean‖Δthrottleᵢ‖ ÷ dt.
- `crashed` = any non-finite state OR fell to ground with downward speed while a
  positive altitude was commanded.
- `score` = clamp(100 − k₁·RMSE − k₂·overshoot − k₃·tilt − k₄·effort, 0, 100),
  forced to 0 if crashed.

## 3. File / module layout
New: `src/core/experiments/{Experiment.ts, presets.ts, *.test.ts}`; barrel
export. UI: `src/components/experiments/ExperimentPanel.tsx` + a rail entry.

## 4. Key decisions & trade-offs
| Decision | Options | Choice | Why |
|---|---|---|---|
| Experiment = config fn vs DSL | DSL / function | **setup function over Simulation** | Maximum flexibility, trivial to add presets |
| Tracking error reference | fixed setpoint / logged setpoint | **logged per-sample setpoint** | Works for missions/trajectories too (FR5) |
| Scoring | opaque ML / transparent formula | **transparent weighted formula** | Explainable to students; tunable later |

## 5. Constitution conformance
- **P1/P2** deterministic, validated (AC1–AC6 tests); **P3** pure core, Node-runnable.
- Additive; experiments only *configure + run* a normal Simulation (no behavior change).

## 6. Testing strategy
Unit/validation: hover score ≥ 80 (AC1), step rise/settling non-null (AC2), wind
bounded (AC3), determinism (AC4), crash flagged & score 0 (AC5), Node headless
(AC6). All Vitest.

## 7. Risks & mitigations
- *Score weights feel arbitrary* → keep formula transparent + documented; expose
  later. *Crash heuristic* → conservative; covered by a dedicated test.

## 8. Rollout / migration
1. Core runner + presets + tests. 2. UI Experiments panel (run + scorecard +
"apply this config to the live sim"). 3. Later: compare runs, custom experiments,
export scorecards.
