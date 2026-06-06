# Spec: Core Engine Refactor (`@flylab/core`)

**Feature ID:** 001-core-engine · **Status:** ready
**Owner:** FlyLab · **Created:** 2026-06-06

## 1. Summary
Extract and re-architect the simulation engine into a headless, framework-agnostic
TypeScript package (`@flylab/core`) that runs identically in the browser, a Web
Worker, and Node.js. Replace Euler-angle attitude with quaternions, route all
randomness through a seeded RNG for bit-reproducible runs, make the integrator
pluggable, and add a battery/powertrain model. Establish a physics validation
test suite so the numbers are trustworthy.

## 2. Motivation & user value
Pillar: **Simulate** (foundation for all three pillars).
Today physics runs on the main thread, attitude can hit gimbal lock near ±90°
pitch, runs are not reproducible, and there are zero tests. Professionals can't
trust untested numbers; researchers can't reproduce a run; and we can't run
batch experiments headless. This refactor is the bedrock for every later phase.

## 3. User stories
- As an **engineer**, I want bit-identical results from the same seed+config so
  that I can reproduce and share an exact run.
- As a **researcher**, I want to run the engine headless in Node so that I can
  batch thousands of runs in CI / experiments.
- As a **pilot**, I want aerobatic attitudes (loops, flips) without numerical
  blowups so that flips through vertical are stable.
- As a **student**, I want a realistic battery that drains and sags so that I
  learn how energy limits flight time.
- As a **contributor**, I want the engine free of UI deps so that I can test and
  extend it without a browser.

## 4. Functional requirements
- **FR1.** The engine MUST run with no DOM / React / Three.js imports.
- **FR2.** Attitude MUST be represented internally as a unit quaternion;
  Euler angles are derived only for display/IO.
- **FR3.** All stochastic effects (turbulence, sensor noise, gusts) MUST draw
  from an injectable seeded RNG. No `Math.random()` in core.
- **FR4.** Given identical {seed, config, input sequence}, two runs MUST produce
  identical state trajectories (bit-for-bit within float determinism).
- **FR5.** The integrator MUST be selectable: RK4, adaptive RK45, semi-implicit.
- **FR6.** A battery model MUST compute pack voltage under load (sag), state of
  charge, and current draw, and expose remaining flight-time estimate.
- **FR7.** The simulation MUST be runnable inside a Web Worker via a typed
  message protocol (start/pause/reset/step/config/state-snapshot).
- **FR8.** The engine MUST expose a stable, documented public API surface.
- **FR9.** A serialized run record (seed + config + inputs) MUST be replayable to
  reproduce the trajectory.

## 5. Acceptance criteria
- **AC1.** Given the default quad at rest, when motors produce thrust = weight,
  then altitude stays within 1e-3 m over 10 s (hover equilibrium).
- **AC2.** Given motors off from rest at z=10 m, when simulated, then z(t)
  matches `10 − ½·g·t²` within 1% until ground contact (free-fall).
- **AC3.** Given a seed, when the same scenario runs twice, then every logged
  state sample is equal (determinism).
- **AC4.** Given a continuous flip (pitch through ±90°/±180°), when simulated,
  then state stays finite and the quaternion stays normalized (|q|−1 < 1e-6).
- **AC5.** Given a hover at constant thrust, when simulated, then battery SoC
  decreases monotonically and predicted flight-time is within 10% of integrated
  energy draw.
- **AC6.** Given the engine imported in Node, when a scenario runs, then it
  completes with no browser globals (verified in CI).

## 6. Non-functional requirements
- **P1 Accuracy:** every physics claim above is a passing test.
- **P2 Determinism:** enforced by FR3/FR4 + AC3.
- **P3 Headless:** enforced by FR1 + AC6.
- **P6 Performance:** ≥ 1000 sim steps/s for a single quad on a typical laptop
  in the Worker; real-time factor reported.
- Backward compatible enough that the existing UI keeps working through an
  adapter during migration.

## 7. Out of scope
- Multi-airframe library, sensor suite, EKF (Phase 2).
- Advanced controllers beyond existing PID (Phase 3).
- r3f migration / scenario editor (Phase 4).

## 8. Open questions / clarifications
- [ ] SharedArrayBuffer for zero-copy state vs. structured-clone snapshots —
      decide in plan based on COOP/COEP hosting constraints.
- [ ] Float determinism across engines (V8 only vs. cross-browser) — document
      the guarantee boundary.
