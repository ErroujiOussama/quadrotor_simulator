# FlyLab Roadmap

**FlyLab is a browser-native robotics drone simulation laboratory** — for control,
autonomy, mission planning, and education. Not a flight *game*: a robotics *lab*.

The gap it fills: serious drone simulators (Gazebo+PX4, AirSim, Flightmare,
gym-pybullet-drones, Webots, Isaac/Pegasus) are powerful but heavy, desktop-bound,
and hard to start; browser drone sims are usually toys. FlyLab's edge is
**robotics-first + browser-first + experiment-first + autonomy-first**: open a tab,
run a real experiment, score it, share it by URL.

Spec-driven (see `.specify/`). Each feature folder carries `spec.md` / `plan.md` /
`tasks.md`.

## Shipped
- **000 — OSS + spec-kit foundation** (license, CI, tests, constitution).
- **001 — Core engine** `@flylab/core`: headless, deterministic, quaternion 6DOF,
  RK4/RK45/semi-implicit, battery, Web Worker, validation suite.
- **002 — Vehicle plugins & multi-airframe**: `Vehicle` interface, RotorCraft,
  quad-X/+, hexa-X, octo-X — physics → control → telemetry → UI → 3D model.
- **003 — Sensors & estimation (display)**: IMU/GPS/baro/mag + Mahony+KF estimator;
  estimated-vs-true error in telemetry; "EKF" toggle.

## Next — make it feel like a robotics lab
- **004 — Experiment & scoring lab**  → `specs/004-experiment-lab/`
  Predefined experiments (hover stability, step response, trajectory tracking,
  wind rejection, motor-failure recovery, sensor-noise robustness, waypoint
  mission) that each emit a **scorecard** (position RMSE, overshoot, settling,
  energy, max tilt, control effort, crashed/completed, 0–100 score). Headless +
  reproducible. This is what turns a simulator into a lab.
- **005 — Scenario editor**: obstacles, gates, landing pads, no-fly/wind/sensor-
  denied zones, moving targets; collisions; save/load scenarios as JSON; share by URL.
- **006 — Controller playground**: swappable controllers (PID, cascaded, LQR,
  geometric SE(3), **user-defined JavaScript controller**) + side-by-side compare
  with step/Bode/settling analysis.

## Then — useful for robotics students & researchers
- **007 — Robotics topic abstraction & API**: ROS2-style channels
  (`/state /imu /gps /baro /camera /cmd` …) + a scriptable JS task API
  (hover, tracking, formation, avoidance, landing); flight-log **replay** +
  run comparison; export CSV/JSON/ROSbag-like.
- **008 — Error-state EKF**: gyro-bias error-state filter → unlock closed-loop
  fly-on-estimate (deferred from 003).
- **009 — Perception sensors & tasks**: depth/down camera, optical flow,
  rangefinder/LiDAR-lite, AprilTag/ArUco landing marker; visual-servo tasks.

## Then — respected by drone people
- **010 — MAVLink**: message visualization → QGroundColor `.plan` import/export →
  PX4/ArduPilot SITL via a WebSocket bridge.
- **011 — Multi-drone & swarm**: formation, collision avoidance, leader-follower,
  coverage/search.

## Research-grade
- **012 — RL/Gym-like API**, WebGPU/WASM acceleration, dataset/replay export,
  classroom/lab mode (instructor assignments), plugin registry.
- **Validation page**: equations, assumptions, model docs, standard tests &
  expected behavior — scientifically defensible.

## Principle
Do not chase photorealism first (AirSim/Isaac/MSFS win there). Win on
accessibility + robotics workflow: experiments, scoring, controllers, autonomy,
and interoperability — all in a browser tab.
