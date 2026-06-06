# Tasks: Core Engine Refactor (`@flylab/core`)

**Feature ID:** 001-core-engine · **Plan:** ./plan.md

## Legend
`[ ]` todo · `[~]` in progress · `[x]` done · `(P)` parallelizable

## Tasks
- [x] **T1.** Vitest + test infra wired into Vite; `test`/`test:run`/`coverage` scripts.
- [x] **T2 (P).** `math/`: `Vec3`, `Quat`, constants — done when algebra unit tests pass.
- [x] **T3 (P).** `rng/`: `SeededRng` (mulberry32) + Gaussian + `fork()` — done when
  determinism + distribution tests pass.
- [x] **T4.** `physics/Battery.ts` LiPo model — done when SoC/sag/flight-time tests pass.
- [x] **T5.** `physics/integrators.ts`: RK4, RK45, semi-implicit behind one signature.
- [x] **T6.** `physics/state.ts`: quaternion-based 6DOF state + derivative algebra.
- [x] **T7.** `vehicles/Multirotor.ts`: X-quad forces/torques + powertrain + battery.
- [x] **T7b.** `index.ts` public API barrel (FR8).
- [x] **T8.** `sim/Simulation.ts`: fixed-step loop + `sim/RunRecord.ts` (seed+config+inputs replay).
- [x] **T9.** `control/`: `FlightController` (cascade + modes + mixing) + PID ported to core.
- [x] **T10.** `worker/`: typed `protocol.ts` + pure testable `SimEngine` + browser `sim.worker.ts`.
- [x] **T11.** ESLint boundary rule (no react/three/UI in `src/core`) + headless Node test (AC6).
- [x] **T12.** Adapter (`lib/simulation/DroneSimulator` over core) + UI switched; build/typecheck parity.
- [~] **T13.** Worker infra built & main-thread path active; full worker UI binding staged (mission
  panel mutates the planner synchronously today — needs an async message rework). Tracked for a
  follow-up spec.
- [x] **T14.** Legacy `src/lib/control` removed; `physics`/`mission`/`simulation` reduced to thin
  shims/adapter over core (single source of truth now in `src/core`).

## Validation gate
- [x] Unit tests pass (math, rng, battery, integrators — 43 tests green total)
- [x] Physics validation tests pass (hover AC1, free-fall AC2, flip AC4, battery AC5)
- [x] Determinism test passes (AC3, unit + system level)
- [x] Headless Node test passes (AC6)
- [x] Typecheck + lint clean; core boundary rule enforced in CI
- [x] Production build splits vendors; Vercel SPA config in place
