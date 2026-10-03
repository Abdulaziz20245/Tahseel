// Web Worker: loads HiGHS once, then replays events and solves per step (Claude.md §9.3, §9.5).
// Requests are handled newest-first; stale ones are answered as "skipped". When idle, it pre-solves
// the next steps so judges clicking "Next event" rarely wait.

import loadHighs from "highs";
import { dataResult } from "../data";
import { createEngine, type Engine } from "./engine";
import type { WorkerRequest, WorkerResponse } from "./solveClient";

const ctx = self as unknown as {
  postMessage: (m: WorkerResponse) => void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
};

if (!dataResult.ok) throw new Error("Scenario data is invalid");
const data = dataResult.data;

let loadError: string | null = null;
const ready: Promise<Engine> = loadHighs({ locateFile: (f: string) => "/solver/" + f })
  .then((highs) => createEngine(data, highs))
  .catch((err: unknown) => {
    loadError = err instanceof Error ? err.message : String(err);
    return createEngine(data, null); // heuristic fallback
  });

let pending: WorkerRequest | null = null;
let busy = false;
const done = new Set<number>();
let prefetchTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePrefetch(engine: Engine, from: number) {
  if (prefetchTimer) clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(() => {
    prefetchTimer = null;
    if (pending || busy) return;
    const next = [...Array(data.events.length + 1).keys()].map((i) => (from + i) % (data.events.length + 1)).find((s) => !done.has(s));
    if (next === undefined) return;
    engine.compute(next); // one step at a time, so new requests are never blocked for long
    done.add(next);
    schedulePrefetch(engine, next);
  }, 50);
}

async function drain() {
  if (busy) return;
  busy = true;
  const engine = await ready;
  while (pending) {
    const req = pending;
    pending = null;
    try {
      const result = engine.compute(req.step);
      done.add(req.step);
      ctx.postMessage({ id: req.id, ok: true, result, method: engine.method, loadError });
    } catch (err) {
      ctx.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  busy = false;
  schedulePrefetch(engine, 0);
}

ctx.onmessage = (e) => {
  // Only the newest request matters; an older one still waiting is answered as skipped.
  if (pending) ctx.postMessage({ id: pending.id, ok: false, skipped: true, error: "superseded" });
  pending = e.data;
  void drain();
};
