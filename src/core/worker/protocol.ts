/**
 * Typed message protocol between the UI (main thread) and the simulation Web
 * Worker. All payloads are structured-clone safe (plain objects) — we
 * deliberately avoid SharedArrayBuffer so the app hosts on static platforms
 * (Vercel/GitHub Pages) that don't set COOP/COEP headers (constitution P5).
 */
import type { SimulationConfig, SimulationData, FailureConfig, RunRecord } from "../sim/types";
import type { ControllerConfig, FlightMode, ManualInputs, SetPoints } from "../control/FlightController";
import type { WindConfig } from "../physics/Environment";
import type { MultirotorParams } from "../vehicles/Multirotor";

export type ToWorker =
  | { t: "init"; seed?: number; config?: Partial<SimulationConfig> }
  | { t: "start" }
  | { t: "pause" }
  | { t: "reset" }
  | { t: "setConfig"; patch: Partial<SimulationConfig> }
  | { t: "setControllerConfig"; config: ControllerConfig }
  | { t: "setSetpoints"; setpoints: Partial<SetPoints> }
  | { t: "setFlightMode"; mode: FlightMode }
  | { t: "setManualInputs"; inputs: Partial<ManualInputs> }
  | { t: "setWind"; wind: Partial<WindConfig> }
  | { t: "setFailures"; failures: Partial<FailureConfig> }
  | { t: "setDroneParams"; params: Partial<MultirotorParams> }
  | { t: "replay"; record: RunRecord; untilTime: number };

export type FromWorker =
  | { t: "ready" }
  | { t: "snapshot"; data: SimulationData }
  | { t: "stopped" };

/** How often the worker posts a snapshot to the UI (Hz). */
export const SNAPSHOT_HZ = 30;
