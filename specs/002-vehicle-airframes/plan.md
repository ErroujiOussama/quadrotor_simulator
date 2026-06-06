# Plan: Vehicle Plugin System & Multi-Airframe

**Feature ID:** 002-vehicle-airframes · **Spec:** ./spec.md
**Status:** ready · **Updated:** 2026-06-06

## 1. Approach
Add the abstraction alongside the existing `Multirotor` (which stays wired to the
UI) so nothing regresses. New modules under `src/core/vehicles/`:
- `Vehicle.ts` — the plugin interface.
- `airframes.ts` — `AirframeSpec`, rotor geometry, mixer matrices, presets.
- `RotorCraft.ts` — generalized N-rotor rigid body implementing `Vehicle`.
Validate with headless tests (mixer parity, per-airframe hover, torque signs,
determinism). A later feature migrates `Simulation` from `Multirotor` to
`RotorCraft` and generalizes telemetry/UI to N motors + runtime selection.

## 2. Architecture & data model
Body frame: X forward, Y left, Z up (matches existing roll-about-X / pitch-about-Y).

```ts
interface RotorDef { position: Vec3; spin: 1 | -1; } // body pos (m), CCW=+1
interface AirframeSpec {
  id: string; name: string; rotorCount: number;
  rotors: RotorDef[];
  mix: number[][];            // N×4 rows of [throttle, roll, pitch, yaw]
  armLength: number;
}
interface Vehicle {
  state: BodyState;
  step(dt: number, windWorld?: Vec3): void;
  reset(initial?: Partial<BodyState>): void;
  hoverThrottle(): number;
  eulerAngles(): { roll; pitch; yaw };
  battery?: Battery;
}
```

Dynamics (per step): per-rotor thrust `f_i = throttle_i · maxThrustPerMotor`.
- Total thrust = Σ f_i along body +Z.
- Torque = Σ (r_i × (0,0,f_i)) + Σ (spin_i · kT · f_i) ẑ
  where r_i × ẑ·f = (p_y·f, −p_x·f, 0) gives roll/pitch from geometry, and the
  reaction term gives yaw. Then the same quaternion 6DOF integration as 001.

Mixing: `throttle_i = clamp(mixRow_i · [base, roll, pitch, yaw], 0, 1)`.

## 3. File / module layout
New: `src/core/vehicles/{Vehicle.ts,airframes.ts,RotorCraft.ts}` +
`src/core/vehicles/RotorCraft.test.ts` + `airframes.test.ts`. Barrel re-exports.

## 4. Key decisions & trade-offs
| Decision | Options | Choice | Why |
|---|---|---|---|
| Allocation | fixed mixer matrix / pseudo-inverse | **fixed matrix** | Matches PX4/Betaflight, reproduces legacy quad exactly (AC1), simple/testable |
| New class vs edit Multirotor | edit / new | **new RotorCraft** | Keeps validated 001 path intact; migrate later |
| Body frame | reuse existing | X-fwd/Y-left/Z-up | Consistent with current torque conventions |

## 5. Constitution conformance
- **P1** per-airframe hover + torque-sign validation tests ship with the code.
- **P3** pure core, no UI/DOM; reuses integrators/state/Battery.
- **P4** airframes are data (`AirframeSpec`) → new frames need no engine edits.
- **P2** uses the same deterministic stepping; determinism test included.

## 6. Testing strategy
Unit: mixer parity (AC1), torque signs (AC3), hover thrust = weight (AC4).
Validation: per-airframe hover hold (AC2). Determinism (AC5). All headless Vitest.

## 7. Risks & mitigations
- *Sign/þgeometry errors* → covered by torque-sign + hover tests; quad parity test
  pins behavior to the validated legacy mixer.
- *Scope creep into UI* → explicitly deferred; this feature is core-only.

## 8. Rollout / migration
1. Land core + tests (no UI change). 2. Later feature: `Simulation` accepts an
`AirframeSpec`, telemetry/`SimulationData` generalize to N motors, UI gets an
airframe selector + N-motor inspector, adapter maps it. 3. Motor-failure study
UX (hexa redundancy demo).
