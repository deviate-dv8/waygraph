// Run events: what happened, step by step, during a run. Core emits them; subscribers (the run log, the demo overlay,
// reports, Waygraph UI) listen. Emitting never throws into the run.
import { AsyncLocalStorage } from "node:async_hooks";

export type RunEvent =
  | { type: "run:start"; runId: string; at: number; label?: string }
  | { type: "step:start"; runId: string; at: number; index: number; block: string; from: string }
  | { type: "step:end"; runId: string; at: number; index: number; block: string; to: string; ms: number }
  | { type: "step:error"; runId: string; at: number; index: number; block: string; error: string; ms: number }
  | { type: "run:end"; runId: string; at: number; ok: boolean; result?: string; error?: string; ms: number }
  | { type: "run:artifact"; runId: string; at: number; kind: "video" | "trace" | "screenshot"; path: string };

/** What {@link onRunEvent} calls with each event. */
export type RunEventListener = (event: RunEvent) => void;
const listeners = new Set<RunEventListener>();

/** Subscribes to every run event in this process; returns the unsubscribe function. */
export function onRunEvent(listener: RunEventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(event: RunEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      /* a broken subscriber never breaks a run */
    }
  }
}

interface OpenRun {
  runId: string;
  startedAt: number;
  index: number;
  step?: { index: number; block: string; startedAt: number } | undefined;
}

/**
 * The run each async call chain is in. Per chain, not per process: two runs at once (parallel traverse workers, a UI
 * hosting several) each get their own id and step counter; a flow nested in another joins its parent's run.
 */
const scope = new AsyncLocalStorage<OpenRun>();

/**
 * Runs `body` as a run: opens one (`run:start` ... `run:end`), or joins the run its caller is already in (a flow nested in
 * another, a runner driving a chain step by step). `resultOf` names the outcome for `run:end`.
 */
export async function inRun<T>(label: string | undefined, body: () => Promise<T>, resultOf?: (value: T) => string | undefined): Promise<T> {
  if (scope.getStore()) return body();
  const at = Date.now();
  const run: OpenRun = { runId: `${new Date(at).toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`, startedAt: at, index: 0 };
  emit({ type: "run:start", runId: run.runId, at, ...(label ? { label } : {}) });
  const end = (outcome: { result?: string | undefined; error?: unknown }): void => {
    const done = Date.now();
    emit({
      type: "run:end",
      runId: run.runId,
      at: done,
      ok: !("error" in outcome),
      ...(outcome.result !== undefined ? { result: outcome.result } : {}),
      ...("error" in outcome ? { error: outcome.error instanceof Error ? outcome.error.message : String(outcome.error) } : {}),
      ms: done - run.startedAt,
    });
  };
  try {
    const value = await scope.run(run, body);
    end({ result: resultOf?.(value) });
    return value;
  } catch (err) {
    end({ error: err });
    throw err;
  }
}

export function stepStarted(block: string, from: string): void {
  const open = scope.getStore();
  if (!open) return;
  const at = Date.now();
  open.step = { index: open.index++, block, startedAt: at };
  emit({ type: "step:start", runId: open.runId, at, index: open.step.index, block, from });
}

export function stepEnded(block: string, to: string): void {
  const open = scope.getStore();
  if (!open?.step) return;
  const at = Date.now();
  emit({ type: "step:end", runId: open.runId, at, index: open.step.index, block, to, ms: at - open.step.startedAt });
  open.step = undefined;
}

/** The step that started last failed. */
export function stepFailed(error: unknown): void {
  const open = scope.getStore();
  if (!open?.step) return;
  const at = Date.now();
  const { index, block, startedAt } = open.step;
  emit({ type: "step:error", runId: open.runId, at, index, block, error: error instanceof Error ? error.message : String(error), ms: at - startedAt });
  open.step = undefined;
}

/** The id of the run open right now, if any. */
export function currentRunId(): string | undefined {
  return scope.getStore()?.runId;
}

export function recordArtifact(kind: "video" | "trace" | "screenshot", path: string, runId = scope.getStore()?.runId): void {
  if (runId) emit({ type: "run:artifact", runId, at: Date.now(), kind, path });
}

/** The last real Block inside a Block built by `connect` (or the Block itself). */
export function lastLeaf(block: object): string {
  return (block as { __wgLastLeaf?: string }).__wgLastLeaf ?? (block as { name: string }).name;
}

export function isConnected(block: object): boolean {
  return (block as { __wgLastLeaf?: string }).__wgLastLeaf !== undefined;
}
