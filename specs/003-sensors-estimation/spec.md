# Spec: Sensor Suite & State Estimation

**Feature ID:** 003-sensors-estimation · **Status:** ready
**Owner:** FlyLab · **Created:** 2026-06-06

## 1. Summary
Add realistic, deterministic sensor models (IMU, GPS, barometer, magnetometer)
and a state estimator that fuses them into an estimated vehicle state. Surface
the estimated state alongside the true state so users can see estimation error,
and optionally close the control loop on the estimate (as a real autopilot does).

## 2. Motivation & user value
Pillar: **Simulate / Configure / Learn**. Real autopilots never see the true
state — they fly on a noisy, drifting estimate. Engineers want to study how
sensor noise, bias, and update rate degrade estimation and control; students
want to *see* the gap between truth and what the filter believes. This is a
defining capability that browser sims almost never have.

## 3. User stories
- As an **engineer**, I want IMU/GPS/baro/mag with configurable noise & rate so
  I can study their effect on estimation.
- As a **student**, I want to see "estimated vs true" position/attitude error so
  I understand why drones drift.
- As a **researcher**, I want to optionally fly on the estimate (closed loop) to
  study estimator-in-the-loop stability.
- As anyone, I want it reproducible — same seed ⇒ same noise ⇒ same estimate.

## 4. Functional requirements
- **FR1.** IMU MUST output body-frame specific force (accel) and angular rate
  (gyro) with configurable Gaussian noise and constant bias.
- **FR2.** GPS MUST output world position at a configurable rate (Hz) with noise.
- **FR3.** Barometer MUST output altitude with noise and slow bias drift.
- **FR4.** Magnetometer MUST output a heading (yaw) reference with noise.
- **FR5.** A state estimator MUST fuse these into an estimated attitude
  (complementary/Mahony) and position+velocity (per-axis Kalman filter).
- **FR6.** All sensor randomness MUST flow through the injected seeded RNG (P2).
- **FR7.** The simulation MUST expose estimated state + estimation error in
  telemetry, and a flag to drive control from the estimate instead of truth.
- **FR8.** Sensors/estimation are additive — with them disabled, behavior equals
  spec 002 exactly.

## 5. Acceptance criteria
- **AC1.** With default noise, the estimated attitude tracks true within 3° RMS
  in a 10 s hover.
- **AC2.** With default GPS/baro noise, estimated position tracks true within
  the GPS noise level (< 1.0 m) in position-hold.
- **AC3.** IMU/GPS noise is statistically correct (≈ configured std-dev) and
  deterministic for a fixed seed (two runs identical).
- **AC4.** Flying on the estimate (closed loop) stays stable in position-hold
  (bounded position error) with default noise.
- **AC5.** With sensors disabled, telemetry/behavior is identical to spec 002.

## 6. Non-functional requirements
- Headless, dependency-free core (P3); SI units; deterministic (P2).
- Estimator runs at sim rate; sensors at their own configured rates.

## 7. Out of scope
- Full 15-state error-state EKF / UKF (complementary + linear KF is enough to
  demonstrate the concept and stays robust/testable). Visual sensor cameras,
  optical flow, LiDAR. GPS multipath/fix-loss modeling (future).

## 8. Open questions
- [ ] Expose per-sensor rate/noise in the UI now, or a single "sensor quality"
      preset first? → start with a compact toggle + the existing sensorNoise.
