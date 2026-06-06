# FlyLab Roadmap

Spec-driven phases. Each feature folder under `specs/` carries its own
`spec.md` / `plan.md` / `tasks.md`. This file is the index and the why-in-order.

## Phase 0 — OSS foundation (in progress)
License, contribution docs, package identity, README, CI, test infra, spec-kit
scaffold. Unblocks everything; no product behavior change.

## Phase 1 — Core engine refactor  → `specs/001-core-engine/`
The foundation everything builds on.
- Headless, framework-agnostic `@flylab/core` (runs in browser, Worker, Node).
- Quaternion attitude (kill gimbal lock); Euler for display only.
- Seeded deterministic RNG; record/replay-ready.
- Pluggable integrators (RK4, adaptive RK45, semi-implicit).
- Battery / powertrain model → flight-time & range.
- Physics **validation** test suite (hover, free-fall, energy, settling).
- Web Worker sim loop with typed message protocol.

## Phase 2 — Fidelity & extensibility  → `specs/002-…`, `003-…`
- Plugin system: `Vehicle` / `Controller` / `Sensor` / `Integrator` / `Scenario`.
- Airframes: quad (X/+/H), hexa, octo, Y6, tricopter, fixed-wing, VTOL, heli.
- Custom frame builder → auto inertia tensor.
- Blade-element prop aero, ground effect, vortex-ring, translational lift.
- Sensor suite (IMU/GPS/baro/mag/rangefinder/optical-flow/cameras) with
  realistic noise, bias, latency; EKF / complementary / UKF estimation.
- Slung loads, tethers, payloads.

## Phase 3 — Advanced control  → `specs/004-…`
- Controllers: cascaded quaternion attitude, LQR, geometric SE(3), MPC, INDI.
- Controller Lab: side-by-side compare, step/Bode/Nyquist, pole-zero,
  auto-tune, stability margins, real rise/settling/overshoot metrics.
- System identification (chirp/PRBS → fitted model).

## Phase 4 — World & UX  → `specs/005-…`
- react-three-fiber + drei scene engine; GLTF assets; PBR; sky/sun; post-fx.
- Scenario editor: obstacles, FPV gates, buildings, terrain (DEM), OSM→3D city.
- Multi-drone & swarm; formation flight; inter-drone collision.
- VR/WebXR; cinematic camera; RC via WebHID/WebUSB; race layer + leaderboards.

## Phase 5 — Data & API  → `specs/006-…`
- Scriptable JS/TS API + in-app console; Python via Pyodide.
- Flight-log recorder + scrubbable replay; run comparison overlay.
- Import Betaflight/PX4 ULog; export CSV/JSON/Parquet; QGC `.plan`, KML/GPX.
- Save/load projects (JSON); shareable permalinks; embeddable widget.

## Phase 6 — Learning platform  → `specs/007-…`
- Guided interactive tutorials; courses; auto-graded challenges; badges.
- KaTeX theory panels coupled to live state; classroom/instructor mode.

## Phase 7 — Interop  → `specs/008-…`
- MAVLink bridge; PX4 / ArduPilot SITL (WASM or WebSocket); QGroundControl.
- Plugin registry / marketplace for community vehicles, controllers, scenarios.
