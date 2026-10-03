// Browser side of the solver (Claude.md §9.5): a Web Worker when possible, otherwise the same engine
// on the main thread. If HiGHS cannot load at all, the engine falls back to the heuristic.

import type { StepResult } from "./engine";

export interface WorkerRequest {
  id: number;
  step: number;
}

export type WorkerResponse =
  | { id: number; ok: true; result: StepResult; method: "mip" | "heuristic"; loadError: string | null }
  | { id: number; ok: false; error: string; skipped?: boolean };

export interface SolveOutcome {
  result: StepResult;
  method: "mip" | "heuristic";
  loadError: string | null; // why HiGHS failed to load (heuristic in use)
  runtime: "worker" | "main-thread";
}

export interface SolveClient {
  /** Resolves with the step's result, or null if a newer request superseded it. */
  request(step: number): Promise<SolveOutcome | null>;
  dispose(): void;
}

export function createSolveClient(): SolveClient {
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  return worker ? workerClient(worker) : mainThreadClient();
}

function workerClient(worker: Worker): SolveClient {
  let nextId = 1;
  const waiting = new Map<number, { step: number; resolve: (o: SolveOutcome | null) => void; reject: (e: Error) => void }>();
  let fallback: SolveClient | null = null;

  // If the worker script itself fails (e.g. blocked), answer everything from the main thread instead.
  worker.onerror = (e) => {
    e.preventDefault?.();
    worker.terminate();
    fallback = mainThreadClient();
    for (const [id, w] of waiting) {
      waiting.delete(id);
      fallback.request(w.step).then(w.resolve, w.reject);
    }
  };
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data;
    const w = waiting.get(msg.id);
    if (!w) return;
    waiting.delete(msg.id);
    if (msg.ok) w.resolve({ result: msg.result, method: msg.method, loadError: msg.loadError, runtime: "worker" });
    else if (msg.skipped) w.resolve(null);
    else w.reject(new Error(msg.error));
  };

  return {
    request(step) {
      if (fallback) return fallback.request(step);
      const id = nextId++;
      return new Promise((resolve, reject) => {
        waiting.set(id, { step, resolve, reject });
        worker.postMessage({ id, step } satisfies WorkerRequest);
      });
    },
    dispose() {
      worker.terminate();
      fallback?.dispose();
    },
  };
}

function mainThreadClient(): SolveClient {
  const engine = (async () => {
    const [{ default: loadHighs }, { createEngine }, { dataResult }] = await Promise.all([
      import("highs"),
      import("./engine"),
      import("../data"),
    ]);
    if (!dataResult.ok) throw new Error("Scenario data is invalid");
    try {
      const highs = await loadHighs({ locateFile: (f: string) => "/solver/" + f });
      return { engine: createEngine(dataResult.data, highs), loadError: null as string | null };
    } catch (err) {
      return { engine: createEngine(dataResult.data, null), loadError: err instanceof Error ? err.message : String(err) };
    }
  })();
  let latest = 0;
  return {
    async request(step) {
      const ticket = ++latest;
      const { engine: e, loadError } = await engine;
      if (ticket !== latest) return null; // superseded while loading
      return { result: e.compute(step), method: e.method, loadError, runtime: "main-thread" };
    },
    dispose() {},
  };
}
