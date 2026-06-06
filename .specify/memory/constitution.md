# FlyLab Constitution

> The governing principles for FlyLab — an open-source, browser-native, advanced
> flight-dynamics simulation platform for students, professionals, and engineers.
> Every spec, plan, and implementation MUST conform to these principles. When a
> proposed change conflicts with a principle, the principle wins unless this
> document is amended first.

**Version:** 1.0.0 · **Ratified:** 2026-06-06 · **Last amended:** 2026-06-06

---

## Article I — Mission

FlyLab makes high-fidelity flight simulation **accurate enough that a controls
engineer trusts the numbers, and clear enough that a student learns from them** —
running entirely in a web browser with zero install.

Three pillars, in priority order when they conflict:

1. **Simulate** — physically credible, reproducible dynamics.
2. **Configure** — every vehicle, sensor, controller, environment, and mission
   is inspectable and adjustable.
3. **Analyze** — telemetry, replay, comparison, and a scriptable API turn runs
   into insight.

## Article II — Core Principles

### P1. Accuracy is non-negotiable
Physics models are derived from first principles (Newton–Euler, blade-element,
etc.) and **validated against analytic or published reference cases**. No model
ships without a validation test. Approximations are allowed but MUST be
documented and toggleable.

### P2. Determinism & reproducibility
Given the same seed, config, and inputs, a simulation MUST produce **bit-identical**
results. All randomness flows through a seeded RNG. No `Math.random()` in the
core. Every run is recordable and replayable.

### P3. Headless core, separable from UI
The simulation engine (`@flylab/core`) is framework-agnostic TypeScript with
**zero DOM/React/Three.js dependencies**. It runs in a Web Worker, in Node (CI,
batch experiments), and in the browser identically. UI consumes the core; the
core never imports UI.

### P4. Extensible by plugin, not by fork
Vehicles, controllers, sensors, integrators, and scenarios are **plugins**
implementing stable interfaces. Adding a new airframe or controller MUST NOT
require editing engine internals.

### P5. Zero-install, client-first
The platform is a static-hostable web app by default (GitHub Pages / Vercel).
A backend is optional and additive — the app MUST remain fully functional
without one. No feature may make a backend mandatory.

### P6. Performance is a feature
Physics runs at a fixed timestep decoupled from rendering, off the main thread.
Real-time factor, step rate, and frame rate are observable. Degradation is
graceful (slow down sim time, never corrupt state).

### P7. Teach, don't just compute
Where practical, surface the *why*: equations (rendered), live state coupling,
and explanations sit alongside the numbers. The tool is also a teacher.

### P8. Open by default
Apache-2.0 licensed. Public roadmap, specs-in-repo, semantic versioning,
welcoming contribution docs. Decisions are written down (in `specs/`).

## Article III — Engineering Standards

- **Language:** TypeScript, `strict` mode. No `any` in core without justification.
- **Units:** SI everywhere internally (meters, radians, seconds, kg, Newtons,
  volts, amps). Conversions happen only at UI boundaries, and are labeled.
- **Frames:** Document every coordinate frame. Internally, attitude is stored as
  **quaternions**; Euler angles are a display/IO convenience only.
- **Testing:** Core logic is unit-tested (Vitest). Physics has validation tests.
  UI flows have integration/e2e (Playwright) where they carry risk. CI runs all.
- **Tested before "done":** No task is complete with failing tests, partial
  implementation, or unresolved errors.
- **Style:** New code reads like the surrounding code. Lint and typecheck pass.

## Article IV — Spec-Driven Development

All non-trivial work follows the spec-kit flow and lives under `specs/NNN-name/`:

`constitution → specify → (clarify) → plan → tasks → (analyze) → implement`

- **spec.md** — the *what* and *why*. No tech choices. User stories + acceptance
  criteria + non-functional requirements.
- **plan.md** — the *how*. Architecture, data models, tech choices, trade-offs,
  conformance to this constitution.
- **tasks.md** — ordered, checkable implementation steps.

A feature is not "started" in code until its `spec.md` and `plan.md` exist.

## Article V — Amendment

This constitution is amended by a PR that edits this file, bumps the version
(semver: breaking principle change = major), and records the rationale in the PR.
Specs and code are expected to follow within the same or a subsequent PR.
