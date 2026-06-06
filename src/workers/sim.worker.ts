/**
 * Browser Web Worker shim. Thin by design: it owns a real-time tick and forwards
 * messages to the pure SimEngine (which holds all the logic and is unit-tested
 * in Node). Instantiate from the main thread with:
 *
 *   new Worker(new URL("../workers/sim.worker.ts", import.meta.url), { type: "module" })
 *
 * Vite bundles this automatically (no extra config), which keeps it working on
 * static hosts like Vercel.
 */
/// <reference lib="webworker" />
import { SimEngine } from "@/core/worker/SimEngine";
import { SNAPSHOT_HZ, type ToWorker, type FromWorker } from "@/core/worker/protocol";

const engine = new SimEngine();
const ctx = self as unknown as DedicatedWorkerGlobalScope;

const post = (m: FromWorker) => ctx.postMessage(m);

ctx.onmessage = (e: MessageEvent<ToWorker>) => {
  for (const reply of engine.handle(e.data)) post(reply);
};

// Real-time loop. The worker thread runs independently of the UI frame rate, so
// physics keeps a steady step rate even when the main thread is busy rendering.
let last = performance.now();
const tick = () => {
  const now = performance.now();
  const snap = engine.advance(now - last, now, SNAPSHOT_HZ);
  last = now;
  if (snap) post(snap);
  setTimeout(tick, 4); // ~250 Hz scheduling; SimEngine sub-steps to the fixed dt
};
tick();
