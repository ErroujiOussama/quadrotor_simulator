/**
 * Record/replay support (spec 001 FR9). A RunRecord captures the seed, all
 * config, and a sparse timeline of input events. Replaying it reconstructs the
 * exact trajectory — the backbone of reproducible bug reports and lessons.
 */
import { Simulation } from "./Simulation";
import type { RunRecord } from "./types";

/** Build a fresh Simulation configured from a record (before events applied). */
export function simulationFromRecord(rec: RunRecord): Simulation {
  const sim = new Simulation({
    seed: rec.seed,
    config: rec.simConfig,
    controllerConfig: rec.controllerConfig,
    droneParams: rec.droneParams,
  });
  sim.setWind(rec.wind);
  sim.setFailures(rec.failures);
  sim.setFlightMode(rec.initialFlightMode);
  return sim;
}

/**
 * Replay a record to a given end time, applying input events at their timestamps.
 * Returns the simulation at the end so callers can inspect history/state.
 */
export function replay(rec: RunRecord, untilTime: number): Simulation {
  const sim = simulationFromRecord(rec);
  const dt = rec.simConfig.timestep;
  const events = [...rec.events].sort((a, b) => a.t - b.t);
  let ei = 0;
  while (sim.getTime() < untilTime - 1e-9) {
    // Apply any events scheduled at or before the current time.
    while (ei < events.length && events[ei].t <= sim.getTime() + 1e-9) {
      applyEvent(sim, events[ei]);
      ei++;
    }
    sim.step();
    if (sim.getTime() >= 1e7) break; // safety
    void dt;
  }
  return sim;
}

function applyEvent(sim: Simulation, ev: { kind: string; payload: unknown }): void {
  switch (ev.kind) {
    case "setpoints": sim.setSetpoints(ev.payload as never); break;
    case "flightMode": sim.setFlightMode(ev.payload as never); break;
    case "manualInputs": sim.setManualInputs(ev.payload as never); break;
    case "wind": sim.setWind(ev.payload as never); break;
    case "failures": sim.setFailures(ev.payload as never); break;
    case "controllerConfig": sim.setControllerConfig(ev.payload as never); break;
    default: break;
  }
}
