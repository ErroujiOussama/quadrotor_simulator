/**
 * SimEngine — the worker-side logic, kept pure and DOM-free so it runs (and is
 * tested) in Node. The browser worker shim (src/workers/sim.worker.ts) only
 * wires self.onmessage → handle() and a wall-clock tick → advance(). No timers
 * or postMessage live here, which is exactly why it's testable.
 */
import { Simulation } from "../sim/Simulation";
import { replay } from "../sim/RunRecord";
import type { SimulationData } from "../sim/types";
import type { ToWorker, FromWorker } from "./protocol";

export class SimEngine {
  private sim = new Simulation();
  private running = false;
  private accumulator = 0; // ms of sim time owed
  private lastSnapshotAt = 0; // ms wall clock

  /** Handle a message from the UI. Returns any immediate replies. */
  handle(msg: ToWorker): FromWorker[] {
    switch (msg.t) {
      case "init":
        this.sim = new Simulation({ seed: msg.seed, config: msg.config });
        this.running = false;
        this.accumulator = 0;
        return [{ t: "ready" }];
      case "start": this.running = true; return [];
      case "pause": this.running = false; return [{ t: "stopped" }];
      case "reset":
        this.sim.reset();
        this.accumulator = 0;
        return [this.snapshotMsg()];
      case "setConfig": this.sim.setConfig(msg.patch); return [];
      case "setControllerConfig": this.sim.setControllerConfig(msg.config); return [];
      case "setSetpoints": this.sim.setSetpoints(msg.setpoints); return [];
      case "setFlightMode":
        this.sim.setFlightMode(msg.mode);
        if (msg.mode === "mission") this.sim.waypoints.start();
        return [];
      case "setManualInputs": this.sim.setManualInputs(msg.inputs); return [];
      case "setWind": this.sim.setWind(msg.wind); return [];
      case "setFailures": this.sim.setFailures(msg.failures); return [];
      case "setDroneParams": this.sim.updateDroneParameters(msg.params); return [];
      case "replay": {
        this.sim = replay(msg.record, msg.untilTime);
        return [this.snapshotMsg()];
      }
      default: return [];
    }
  }

  /**
   * Advance simulation by real wall-clock `wallDeltaMs`, honoring the real-time
   * multiplier and stepping at the fixed timestep. Returns a snapshot message at
   * most `snapshotHz` times per second. `nowMs` is the current wall clock.
   */
  advance(wallDeltaMs: number, nowMs: number, snapshotHz: number): FromWorker | null {
    if (!this.running) return null;
    const cfg = this.sim.getConfig();
    const stepMs = cfg.timestep * 1000;
    this.accumulator += Math.min(wallDeltaMs, 100) * cfg.realTimeMultiplier;

    let steps = 0;
    const maxSteps = 50; // anti-spiral
    while (this.accumulator >= stepMs && steps < maxSteps) {
      this.sim.step();
      this.accumulator -= stepMs;
      steps++;
    }

    if (nowMs - this.lastSnapshotAt >= 1000 / snapshotHz) {
      this.lastSnapshotAt = nowMs;
      return this.snapshotMsg();
    }
    return null;
  }

  isRunning(): boolean { return this.running; }
  getSimulation(): Simulation { return this.sim; }

  private snapshotMsg(): FromWorker {
    const data = this.sim.getCurrentData() ?? this.emptySnapshot();
    return { t: "snapshot", data };
  }

  private emptySnapshot(): SimulationData {
    const n = this.sim.getAirframe().rotorCount;
    return {
      time: 0,
      state: this.sim.getEulerState(),
      motorThrottles: new Array(n).fill(0),
      motorSpeeds: new Array(n).fill(0),
      airframe: this.sim.getAirframe().id,
      controlOutputs: { altitude: 0, roll: 0, pitch: 0, yaw: 0, positionX: 0, positionY: 0 },
      errors: { altitude: 0, roll: 0, pitch: 0, yaw: 0, positionX: 0, positionY: 0 },
      setpoints: this.sim.getSetpoints(),
      flightMode: this.sim.getFlightMode(),
      manualInputs: this.sim.getManualInputs(),
      missionState: this.sim.waypoints.getMissionState(),
      battery: { soc: 1, voltage: 0, drawnAh: 0, flightTimeS: 0 },
    };
  }
}
