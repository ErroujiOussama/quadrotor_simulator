import { describe, it, expect } from "vitest";
import { Simulation } from "./Simulation";

describe("Simulation", () => {
  it("position-hold converges to the altitude setpoint", () => {
    const sim = new Simulation({ seed: 1 });
    sim.setFlightMode("position_hold");
    sim.setSetpoints({ position: { x: 0, y: 0, z: 3 } });
    sim.run(4000); // 40 s at dt=0.01
    const z = sim.getEulerState().position.z;
    expect(Math.abs(z - 3)).toBeLessThan(0.2);
  });

  it("is deterministic for a given seed (AC3 at the system level)", () => {
    const make = () => {
      const s = new Simulation({ seed: 7 });
      s.setFlightMode("position_hold");
      s.setWind({ enabled: true, speed: 4, direction: 0.5, turbulenceIntensity: 0.6 });
      s.setSetpoints({ position: { x: 2, y: -1, z: 4 } });
      s.run(1500);
      return s.getEulerState();
    };
    expect(make()).toEqual(make());
  });

  it("different seeds give different turbulent trajectories", () => {
    const run = (seed: number) => {
      const s = new Simulation({ seed });
      s.setFlightMode("position_hold");
      s.setWind({ enabled: true, speed: 5, direction: 0, turbulenceIntensity: 0.9 });
      s.run(1000);
      return s.getEulerState().position.x;
    };
    expect(run(1)).not.toBe(run(2));
  });

  it("drains the battery while flying and reports telemetry", () => {
    const sim = new Simulation({ seed: 3 });
    sim.setFlightMode("position_hold");
    sim.setSetpoints({ position: { x: 0, y: 0, z: 5 } });
    sim.run(2000);
    const d = sim.getCurrentData()!;
    expect(d.battery.soc).toBeLessThan(1);
    expect(d.battery.voltage).toBeGreaterThan(0);
    expect(d.battery.flightTimeS).toBeGreaterThan(0);
  });

  it("flies a hexa airframe and reports 6 motors", () => {
    const sim = new Simulation({ seed: 2, airframe: "hexa_x" });
    sim.setFlightMode("position_hold");
    sim.setSetpoints({ position: { x: 0, y: 0, z: 4 } });
    sim.run(4000);
    const d = sim.getCurrentData()!;
    expect(d.motorThrottles.length).toBe(6);
    expect(d.airframe).toBe("hexa_x");
    expect(Math.abs(d.state.position.z - 4)).toBeLessThan(0.3);
  });

  it("switches airframe at runtime (quad → octo) and keeps flying", () => {
    const sim = new Simulation({ seed: 5 });
    sim.setFlightMode("position_hold");
    sim.setSetpoints({ position: { x: 0, y: 0, z: 3 } });
    sim.run(1000);
    expect(sim.getCurrentData()!.motorThrottles.length).toBe(4);
    sim.setAirframe("octo_x");
    sim.run(2000);
    const d = sim.getCurrentData()!;
    expect(d.motorThrottles.length).toBe(8);
    expect(Number.isFinite(d.state.position.z)).toBe(true);
  });

  it("AC5: estimation disabled leaves telemetry without an estimate", () => {
    const sim = new Simulation({ seed: 1 });
    sim.setFlightMode("position_hold");
    sim.run(200);
    expect(sim.getCurrentData()!.estimated).toBeUndefined();
  });

  it("reports estimated state + error when estimation is enabled", () => {
    const sim = new Simulation({ seed: 1 });
    sim.setEstimation({ enabled: true });
    sim.setFlightMode("position_hold");
    sim.setSetpoints({ position: { x: 0, y: 0, z: 4 } });
    sim.run(3000);
    const d = sim.getCurrentData()!;
    expect(d.estimated).toBeDefined();
    expect(d.estimationError!.position).toBeLessThan(1.5);
    expect(d.estimationError!.attitude).toBeLessThan(0.1); // < ~6°
  });

  it("estimation runs alongside without changing the (truth-based) control loop", () => {
    // Same seed/scenario with estimation on vs off ⇒ identical true trajectory,
    // because the estimator is display-only and does not feed the controller.
    const trajectory = (estimation: boolean) => {
      const sim = new Simulation({ seed: 4 });
      if (estimation) sim.setEstimation({ enabled: true });
      sim.setFlightMode("position_hold");
      sim.setSetpoints({ position: { x: 1, y: 1, z: 4 } });
      sim.run(800);
      const s = sim.getEulerState();
      return [s.position.x, s.position.y, s.position.z];
    };
    expect(trajectory(true)).toEqual(trajectory(false));
  });

  it("computes altitude step-response metrics", () => {
    const sim = new Simulation({ seed: 1 });
    sim.setFlightMode("position_hold");
    sim.setSetpoints({ position: { x: 0, y: 0, z: 5 } });
    sim.run(3000);
    const m = sim.getMetrics();
    expect(m.altitudeRiseTime).not.toBeNull();
    expect(m.altitudeSteadyStateError).toBeLessThan(0.3);
  });
});
