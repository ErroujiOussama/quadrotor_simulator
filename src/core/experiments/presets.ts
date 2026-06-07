/**
 * Built-in robotics experiments. Each configures an ordinary Simulation and runs
 * for a fixed duration; runExperiment scores it. These make FlyLab feel like a
 * lab: objective, repeatable benchmarks for a configuration.
 */
import type { ExperimentSpec } from "./Experiment";
import { createWaypoint } from "../mission/WaypointPlanner";

export const HOVER_STABILITY: ExperimentSpec = {
  id: "hover_stability",
  name: "Hover Stability",
  description: "Hold a fixed point in still air. Measures steady-state position/attitude error.",
  seed: 1,
  durationS: 15,
  setup: (sim) => {
    sim.setFlightMode("position_hold");
    sim.setSetpoints({ position: { x: 0, y: 0, z: 3 } });
  },
};

export const ALTITUDE_STEP: ExperimentSpec = {
  id: "altitude_step",
  name: "Altitude Step Response",
  description: "Command a 1 m → 5 m altitude step. Measures rise time, overshoot, settling.",
  seed: 1,
  durationS: 20,
  setup: (sim) => {
    sim.setFlightMode("position_hold");
    sim.setSetpoints({ position: { x: 0, y: 0, z: 1 } });
  },
  events: [
    { t: 3, apply: (sim) => sim.setSetpoints({ position: { x: 0, y: 0, z: 5 } }) },
  ],
};

export const WAYPOINT_TRACKING: ExperimentSpec = {
  id: "waypoint_tracking",
  name: "Trajectory / Waypoint Tracking",
  description: "Fly a square mission. Measures tracking error along the path.",
  seed: 1,
  durationS: 45,
  setup: (sim) => {
    const z = 3;
    [
      { x: 3, y: 0, z }, { x: 3, y: 3, z }, { x: 0, y: 3, z }, { x: 0, y: 0, z },
    ].forEach((p, i) => sim.waypoints.addWaypoint(createWaypoint(p, `WP${i + 1}`)));
    sim.waypoints.setLooping(false);
    sim.setSetpoints({ position: { x: 0, y: 0, z } });
    sim.setFlightMode("mission");
    sim.waypoints.start();
  },
};

export const WIND_REJECTION: ExperimentSpec = {
  id: "wind_rejection",
  name: "Wind Rejection",
  description: "Hold position in 6 m/s wind with turbulence. Measures disturbance rejection.",
  seed: 7,
  durationS: 20,
  setup: (sim) => {
    sim.setFlightMode("position_hold");
    sim.setSetpoints({ position: { x: 0, y: 0, z: 3 } });
    sim.setWind({ enabled: true, speed: 6, direction: 0.6, turbulenceIntensity: 0.5 });
  },
};

export const MOTOR_FAILURE_RECOVERY: ExperimentSpec = {
  id: "motor_failure",
  name: "Motor Failure (Hexa)",
  description: "Fail one rotor of a hexacopter mid-hover. Tests behavior under actuator loss (full recovery needs control reallocation — future).",
  airframe: "hexa_x",
  seed: 3,
  durationS: 18,
  setup: (sim) => {
    sim.setFlightMode("position_hold");
    sim.setSetpoints({ position: { x: 0, y: 0, z: 4 } });
  },
  events: [
    { t: 6, apply: (sim) => sim.setFailures({ motorFailures: [true, false, false, false] }) },
  ],
};

export const SENSOR_NOISE_ROBUSTNESS: ExperimentSpec = {
  id: "sensor_noise_robustness",
  name: "Sensor-Noise Robustness",
  description: "Hold position with noisy position feedback. Tests robustness to measurement noise.",
  seed: 5,
  durationS: 20,
  setup: (sim) => {
    sim.setFlightMode("position_hold");
    sim.setSetpoints({ position: { x: 0, y: 0, z: 3 } });
    sim.setFailures({ motorFailures: [false, false, false, false], sensorNoise: 0.25 });
  },
};

export const EXPERIMENTS: ExperimentSpec[] = [
  HOVER_STABILITY,
  ALTITUDE_STEP,
  WAYPOINT_TRACKING,
  WIND_REJECTION,
  MOTOR_FAILURE_RECOVERY,
  SENSOR_NOISE_ROBUSTNESS,
];
