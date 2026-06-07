# Spec: Experiment & Scoring Lab

**Feature ID:** 004-experiment-lab · **Status:** ready
**Owner:** FlyLab · **Created:** 2026-06-07

## 1. Summary
Turn the simulator into a *lab*: a library of predefined, reproducible
**experiments** (hover stability, altitude step, trajectory/waypoint tracking,
wind rejection, motor-failure recovery, sensor-noise robustness) that each run
headless and emit a **scorecard** of objective metrics and a 0–100 score.

## 2. Motivation & user value
Pillar: **Analyze / Learn** — the defining "robotics lab" feature. A simulator
shows a drone fly; a lab lets you *measure* how well a configuration flies and
compare. Students get instant, objective feedback; engineers get repeatable
benchmarks for tuning; everyone gets shareable, reproducible results.

## 3. User stories
- As a **student**, I run "hover stability" and get a score + RMSE so I know if my
  PID tune is good.
- As an **engineer**, I run "wind rejection" across gains and compare scorecards.
- As a **researcher**, I run an experiment headless in Node/CI and get the same
  numbers every time (reproducible benchmark).
- As anyone, I see *why* a run scored low (overshoot? crash? high energy?).

## 4. Functional requirements
- **FR1.** An `ExperimentSpec` MUST declare setup (airframe, mode, setpoints,
  wind, failures, gains), a duration, a seed, and optional timed events.
- **FR2.** `runExperiment` MUST run an experiment headless and return a
  `Scorecard` + the full history (reproducible for a fixed seed).
- **FR3.** A `Scorecard` MUST include: position RMSE, attitude RMSE, altitude
  rise/settling/overshoot, max tilt, energy, control effort, crashed/completed,
  and a composite 0–100 score.
- **FR4.** Built-in presets MUST cover: hover stability, altitude step response,
  waypoint/trajectory tracking, wind rejection, motor-failure recovery, and
  sensor-noise robustness.
- **FR5.** Tracking error MUST be measured against the logged setpoint at each
  sample, so it works for any reference (fixed or time-varying).
- **FR6.** Experiments MUST be runnable from the UI with a results display, and
  the core MUST be usable from Node (CI/batch).

## 5. Acceptance criteria
- **AC1.** Hover-stability on a well-tuned quad scores ≥ 80, not crashed, position
  RMSE < 0.2 m.
- **AC2.** Altitude-step produces a non-null rise time and settling time.
- **AC3.** Wind-rejection stays bounded (not crashed) and reports a finite score.
- **AC4.** Two runs of the same experiment+seed produce identical scorecards.
- **AC5.** A crashing experiment is flagged `crashed=true` and scores 0.
- **AC6.** Runs headless in Node (no browser globals).

## 6. Non-functional requirements
- Headless, deterministic core (P1/P2/P3); reuses `Simulation.getMetrics()`.
- Additive — does not change flight behavior; an experiment just configures and
  runs an ordinary `Simulation`.

## 7. Out of scope
- Scenario obstacles/collisions (spec 005) — experiments here use existing
  environment (wind/failures/sensor-noise/waypoints), not geometry.
- User-authored experiments UI (later); presets + a typed API now.

## 8. Open questions
- [ ] Composite score weighting — start transparent/simple; expose weights later.
