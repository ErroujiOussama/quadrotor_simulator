# Plan: Sensor Suite & State Estimation

**Feature ID:** 003-sensors-estimation · **Spec:** ./spec.md
**Status:** ready · **Updated:** 2026-06-06

## 1. Approach
New core modules under `src/core/sensors/` and `src/core/estimation/`, additive
to the validated pipeline. `Simulation` optionally samples sensors from the true
state each step, runs the estimator, and records estimated state + error. A flag
`controlOnEstimate` routes the estimate into the controller; default off so
spec-002 behavior is byte-identical when estimation is disabled.

## 2. Architecture & data model
```ts
// sensors
interface ImuReading { accel: Vec3; gyro: Vec3; }   // body frame
interface SensorConfig {
  accelNoise; gyroNoise; accelBias: Vec3; gyroBias: Vec3;  // m/s², rad/s
  gpsNoise; gpsRateHz; baroNoise; baroBiasWalk; magNoise;  // m, Hz, m, rad
}
class SensorSuite {
  imu(trueState, accelWorld): ImuReading;             // every step
  gps(trueState, dt): {x,y,z} | null;                 // at gpsRateHz
  baro(trueState, dt): number;                        // altitude
  mag(trueState): number;                             // yaw heading
}

// estimation
class StateEstimator {
  predict(imu: ImuReading, dt): void;   // Mahony attitude + KF predict (accel)
  fuseGps(pos): void; fuseBaro(alt): void; fuseMag(yaw): void;
  getState(): BodyState;                // estimated quaternion + pos/vel
}
```
- **Attitude:** Mahony complementary filter — integrate gyro on the quaternion,
  correct with the accelerometer gravity direction (cross-product error) and a
  yaw term from the magnetometer.
- **Position/velocity:** three independent 2-state ([p, v]) Kalman filters.
  Predict with world-frame acceleration `a = R_est·accel + g`; correct x,y with
  GPS and z with the barometer.

## 3. File / module layout
New: `src/core/sensors/Sensors.ts`, `src/core/estimation/StateEstimator.ts`,
`+ *.test.ts`. `Simulation` gains an `EstimationConfig` + estimated telemetry.
`SimulationData` gains `estimated?: EulerState` and `estimationError?`.

## 4. Key decisions & trade-offs
| Decision | Options | Choice | Why |
|---|---|---|---|
| Attitude filter | EKF / Mahony | **Mahony** | Robust, cheap, quaternion-native, easy to validate |
| Position filter | EKF / per-axis KF | **per-axis 2-state KF** | Linear, decoupled, testable; enough for the concept |
| Default coupling | truth / estimate | **truth (estimate optional)** | Preserves validated spec-002 closed loop (FR8/AC5) |

## 5. Constitution conformance
- **P1** estimator accuracy is validated (AC1/AC2/AC4 tests).
- **P2** all noise via injected RNG; determinism test (AC3).
- **P3** pure core; reuses Vec3/Quat/SeededRng.
- Additive; disabled ⇒ identical to spec 002 (AC5).

## 6. Testing strategy
Unit: sensor noise std-dev + determinism (AC3). Validation: attitude RMS < 3°
(AC1), position error < 1 m (AC2), closed-loop-on-estimate stable (AC4),
disabled-equals-truth (AC5). All headless Vitest.

## 7. Risks & mitigations
- *Filter divergence / sign errors* → forgiving tolerances + hover/position-hold
  scenarios; Mahony+KF are well-understood. Iterate gains against tests.
- *Closed-loop-on-estimate instability* → keep it opt-in; tune estimator gains.

## 8. Rollout / migration
1. Land core sensors+estimator + tests. 2. Wire telemetry (est + error) and the
control flag in `Simulation`. 3. UI: estimation inspector card + environment-panel
toggles. Later: per-sensor UI, GPS dropout, cameras/flow.
