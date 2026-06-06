# Plan: Core Engine Refactor (`@flylab/core`)

**Feature ID:** 001-core-engine · **Spec:** ./spec.md
**Status:** ready · **Updated:** 2026-06-06

## 1. Approach
Build the new engine under `src/core/` as a self-contained, dependency-free
TypeScript module tree (future-publishable as `@flylab/core`). Develop it
alongside the existing `src/lib/` code so the running app never breaks; migrate
the UI to it via a thin adapter once the core reaches parity, then delete the
legacy `src/lib` physics. The core is pure functions + small stateful classes
with all I/O (time, randomness) injected, which is what makes it both testable
and deterministic.

## 2. Architecture & data model

```
src/core/
  math/        Vec3, Quat, rotation, clamp, constants   (pure, no deps)
  rng/         SeededRng (mulberry32 + xoshiro128**), Gaussian
  physics/     RigidBody6DOF, integrators, Battery, Powertrain, Environment
  vehicles/    Vehicle interface + Multirotor implementation
  control/     Controller interface + PID adapter (reuse existing logic)
  sim/         Simulation (owns world, steps fixed-dt), RunRecord
  worker/      protocol.ts (typed messages) + sim.worker.ts entry
  index.ts     public API barrel
```

Key types:

```ts
// math
class Vec3 { x; y; z; add/sub/scale/dot/cross/norm/... }   // immutable ops
class Quat { w; x; y; z; mul/normalize/fromEuler/toEuler/rotate/integrate }

// rng — deterministic, injectable
interface Rng { next(): number; gaussian(): number; fork(): Rng }

// state — quaternion attitude
interface BodyState {
  position: Vec3;        // world, m
  velocity: Vec3;        // world, m/s
  attitude: Quat;        // body→world
  angularVel: Vec3;      // body rates, rad/s  (p,q,r)
}

interface Derivative { dPos: Vec3; dVel: Vec3; dQuat: Quat; dOmega: Vec3 }
type Integrator = (s: BodyState, f: (s: BodyState)=>Derivative, dt: number) => BodyState;

// battery
interface BatterySpec { cells: number; capacityAh: number; internalOhm: number;
  cRating: number; restVoltsPerCell(soc:number): number }
class Battery { update(currentA:number, dt:number): void; voltage(): number;
  soc(): number; flightTimeEstimateS(currentA:number): number }

// vehicle plugin
interface Vehicle {
  state: BodyState;
  derivative(s: BodyState, env: Environment, dt: number): Derivative;
  setActuators(cmd: number[]): void;
  battery?: Battery;
}

// worker protocol (structured-clone safe)
type ToWorker = {t:'init',config}|{t:'start'}|{t:'pause'}|{t:'reset'}
  |{t:'step',n:number}|{t:'setConfig',patch}|{t:'input',cmd};
type FromWorker = {t:'snapshot',data:Snapshot}|{t:'ready'}|{t:'metrics',m};
```

## 3. File / module layout
New: everything under `src/core/**` + `src/core/__tests__/**`.
Modified later (migration task): `DroneSimulationInterface.tsx`,
`DroneVisualization.tsx` consume an adapter `src/lib/coreAdapter.ts`.
Legacy `src/lib/physics`, `src/lib/control`, `src/lib/simulation` remain until
parity, then removed in a follow-up.

## 4. Key decisions & trade-offs
| Decision | Options | Choice | Why |
|---|---|---|---|
| Attitude rep | Euler / Quat / DCM | **Quaternion** | No gimbal lock (AC4), cheap renorm, clean integration |
| RNG | Math.random / seeded | **Seeded mulberry32** | Determinism P2/AC3; tiny, fast, forkable |
| Worker transport | SAB / postMessage | **postMessage snapshots first**, SAB behind a flag | SAB needs COOP/COEP headers many static hosts lack (P5); snapshots work everywhere |
| Integrator | fixed RK4 only / pluggable | **Pluggable** | FR5; RK45 for stiff aerobatics, semi-implicit for speed |
| New vs in-place | refactor lib / new core | **New `src/core`, migrate** | Keeps app running; clean dep boundary (P3) |

## 5. Constitution conformance
- **P1** validation tests for hover/free-fall/energy ship with this feature.
- **P2** SeededRng injected everywhere; AC3 test enforces no hidden randomness.
- **P3** `src/core` has an ESLint boundary rule: no import from `react`,
  `three`, or `@/components`. CI runs a Node-only test proving FR1/AC6.
- **P5** default transport works without special headers; SAB optional.
- **P6** Worker keeps physics off the main thread; benchmark test asserts step rate.

## 6. Testing strategy
- **Unit:** Vec3/Quat algebra, RNG determinism + distribution, Battery curve.
- **Validation (physics):** AC1 hover, AC2 free-fall, AC4 flip stability,
  AC5 battery energy, plus angular-momentum/energy sanity on a torque-free body.
- **Determinism:** run scenario twice, deep-equal trajectories (AC3).
- **Headless:** a test that imports `@flylab/core` and runs under Node's
  environment with no jsdom (AC6).
- All wired into Vitest; runs in CI on push/PR.

## 7. Risks & mitigations
- *Float determinism across browsers* → guarantee within same engine; document;
  CI pins Node. Avoid `Math.fround`-sensitive paths; no transcendental-order deps.
- *Migration regressions* → adapter + keep legacy until parity; visual diff.
- *Worker debugging friction* → engine runnable synchronously on main thread too
  (Worker is a transport, not a requirement) for tests and fallback.

## 8. Rollout / migration
1. Land `src/core` + tests (no UI change).
2. Add `coreAdapter.ts` exposing the legacy `DroneSimulator` surface backed by core.
3. Switch `DroneSimulationInterface` to the adapter; verify parity in-app.
4. Move stepping into the Worker; UI consumes snapshots.
5. Delete legacy `src/lib` physics/control/simulation.
