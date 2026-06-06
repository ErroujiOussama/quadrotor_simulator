# Spec: Vehicle Plugin System & Multi-Airframe

**Feature ID:** 002-vehicle-airframes · **Status:** ready
**Owner:** FlyLab · **Created:** 2026-06-06

## 1. Summary
Generalize the hard-coded X-quad into a configurable, plugin-style vehicle model.
Introduce a `Vehicle` interface and an N-rotor `RotorCraft` driven by an
`AirframeSpec` (rotor geometry, spin directions, and a control mixer matrix),
with presets for quad-X, quad-+, hexa-X, and octo-X. This is the foundation for
later airframes (fixed-wing, VTOL) and for swapping airframes at runtime.

## 2. Motivation & user value
Pillar: **Simulate / Configure**. Today only one airframe exists. Students and
engineers want to compare how a hexa rejects a motor failure vs a quad, or how
the + vs X layout changes control authority. A clean vehicle abstraction also
lets the community add airframes as plugins without editing engine internals (P4).

## 3. User stories
- As an **engineer**, I want to pick quad/hexa/octo and see the dynamics and
  mixer change correctly, so I can study redundancy and control allocation.
- As a **student**, I want to see that a hexa keeps flying after one motor fails
  (where a quad tumbles), so I learn about redundancy.
- As a **contributor**, I want to define a new airframe by data (rotor positions,
  spins, mixer) without touching the integrator or controller.

## 4. Functional requirements
- **FR1.** A `Vehicle` interface MUST abstract: state, `step(dt, wind)`, reset,
  `hoverThrottle()`, attitude readout, and an optional battery.
- **FR2.** An `AirframeSpec` MUST describe N rotors by body position, spin
  direction, and a per-rotor control mixer row `[throttle, roll, pitch, yaw]`.
- **FR3.** Presets MUST exist for quad-X, quad-+, hexa-X, octo-X, parameterized
  by arm length.
- **FR4.** `RotorCraft` MUST compute total thrust and body torques from per-rotor
  thrusts using true geometry (r × F) plus reaction yaw torque.
- **FR5.** The quad-X mixer MUST reproduce the existing controller's motor mixing
  exactly (so current validated behavior is preserved when migrated).
- **FR6.** Each preset MUST hover in equilibrium at its computed hover throttle.
- **FR7.** All randomness/determinism guarantees from spec 001 MUST hold.

## 5. Acceptance criteria
- **AC1.** For quad-X, `mixToThrottles` equals the legacy FL/FR/RL/RR formula for
  arbitrary (throttle, roll, pitch, yaw) inputs (bit-equal).
- **AC2.** quad-X, quad-+, hexa-X, octo-X each hold altitude within 1e-2 m over
  10 s when primed at hover throttle (symmetric → zero net torque).
- **AC3.** A positive roll mix command produces a positive body-roll torque
  (sign consistency between mixer and dynamics).
- **AC4.** Total hover thrust equals vehicle weight for every preset.
- **AC5.** Two identical RotorCraft runs (same seed/inputs) match bit-for-bit.

## 6. Non-functional requirements
- Headless, dependency-free core (P3); SI units; quaternion attitude (P1/P3).
- New code is additive — the existing wired Multirotor path is untouched until a
  later migration step, so `main` stays green.

## 7. Out of scope
- Fixed-wing / VTOL aerodynamics (future spec).
- Sensor suite + EKF (future spec).
- Generalizing telemetry/UI to N motors and runtime airframe switching (next
  feature; this spec delivers the validated core + presets).

## 8. Open questions
- [ ] Control allocation for over-actuated frames (hexa/octo): start with fixed
      mixer matrices (Betaflight/PX4 style); revisit pseudo-inverse allocation if
      needed for fault reconfiguration.
