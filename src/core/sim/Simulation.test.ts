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
