<div align="center">

# 🚁 FlyLab

**Open-source, browser-native, advanced flight-dynamics simulation — zero install.**

*High-fidelity enough that a controls engineer trusts the numbers.
Clear enough that a student learns from them.*

[![CI](https://github.com/ErroujiOussama/quadrotor_simulator/actions/workflows/ci.yml/badge.svg)](https://github.com/ErroujiOussama/quadrotor_simulator/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![Spec-Driven](https://img.shields.io/badge/dev-spec--driven-success.svg)](./specs/ROADMAP.md)

</div>

---

FlyLab is a flight simulator that runs entirely in your browser. It pairs a
real-physics simulation core with an interactive 3D cockpit, live telemetry, a
mission planner, and tunable control loops — built to grow into a full platform
for **students**, **professionals**, and **engineers**.

## Why FlyLab

- **Real physics, not eye-candy.** 6DOF Newton–Euler dynamics, quaternion
  attitude (no gimbal lock), RK4/RK45 integration, motor/ESC lag, aerodynamic
  drag, wind & Dryden turbulence, battery sag, and motor-failure injection.
- **Reproducible.** Seeded RNG means the same run replays bit-for-bit.
- **Headless core.** The engine (`@flylab/core`) is framework-agnostic
  TypeScript — runs in the browser, in a Web Worker, and in Node for CI & batch
  experiments.
- **Configure everything.** Airframe, controllers, environment, sensors, and
  missions are inspectable and adjustable live.
- **Analyze.** Live charts, CSV export, performance metrics, and (soon) replay,
  run-comparison, and a scriptable API.

## Current features
- 6DOF quadrotor dynamics with RK4 integration
- Cascaded PID: position → velocity → attitude, plus altitude hold
- Flight modes: manual, stabilized, altitude-hold, position-hold, mission
- 3D viewport (orbit / follow / FPV) with trajectory trail, waypoints, wind arrow
- FPV HUD, live telemetry charts, CSV export
- Keyboard + gamepad input
- Wind, turbulence, motor failures, sensor noise

## Roadmap
See [`specs/ROADMAP.md`](./specs/ROADMAP.md). Highlights ahead: multi-airframe
(hexa/octo/fixed-wing/VTOL), blade-element prop aero, full sensor suite + EKF,
advanced controllers (LQR/SE3/MPC) with a Controller Lab, react-three-fiber
scene editor, multi-drone swarms, scriptable API, learning courses, and a
MAVLink / PX4–ArduPilot SITL bridge.

## Quick start
```bash
npm install
npm run dev        # start the app (Vite)
npm test           # run the test suite (Vitest)
npm run build      # production build
```
Requires Node 20+.

## Deploy (Vercel)
FlyLab is a static SPA — no server required. On Vercel, import the repo and keep
the defaults (it auto-detects Vite); [`vercel.json`](./vercel.json) handles SPA
deep-link rewrites and long-term asset caching. The build runs fully client-side
and **does not use SharedArrayBuffer**, so it needs no special COOP/COEP headers.
```bash
npm i -g vercel && vercel        # preview
vercel --prod                    # production
```
Works the same on GitHub Pages, Netlify, or any static host.

## How we build: Spec-Driven Development
FlyLab follows [spec-kit](https://github.com/github/spec-kit)-style SDD. Nothing
non-trivial is coded before its spec exists. The governing principles live in
[`.specify/memory/constitution.md`](./.specify/memory/constitution.md); each
feature has a `spec.md` → `plan.md` → `tasks.md` under [`specs/`](./specs).

## Contributing
We'd love your help — see [CONTRIBUTING.md](./CONTRIBUTING.md) and our
[Code of Conduct](./CODE_OF_CONDUCT.md). Good first issues are tagged in the
tracker.

## Tech stack
React 18 · TypeScript · Vite · Tailwind · shadcn/ui · Three.js · Vitest

## License
[Apache-2.0](./LICENSE) © FlyLab Contributors
