// Run events: what happened, step by step, during a run. Core emits them; subscribers (the run log, the demo overlay,
// reports, Waygraph UI) listen. Emitting never throws into the run.

export type RunEvent =
  | { type: "run:start"; runId: string; at: number; label?: string }
  | { type: "step:start"; runId: string; at: number; index: number; block: string; from: string }
  | { type: "step:end"; runId: string; at: number; index: number; block: string; to: string; ms: number }
  | { type: "step:error"; runId: string; at: number; index: number; block: string; error: string; ms: number }
  | { type: "run:end"; runId: string; at: number; ok: boolean; result?: string; error?: string; ms: number }
  | { type: "run:artifact"; runId: string; at: number; kind: "video" | "trace" | "screenshot"; path: string };

type Listener = (event: RunEvent) => void;
const listeners = new Set<Listener>();

/** Subscribes to every run event in this process; returns the unsubscribe function. */
export function onRunEvent(listener: Listener): () => void {
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
  depth: number;
  index: number;
  step?: { index: number; block: string; startedAt: number } | undefined;
}
let open: OpenRun | undefined;

/**
 * Opens a run, or joins the one already open (a flow nested in another, or a runner driving a chain step by step). Returns
 * whether this call opened it, so only the opener closes it.
 */
export function beginRun(label?: string): boolean {
  if (open) {
    open.depth += 1;
    return false;
  }
  const at = Date.now();
  open = { runId: `${new Date(at).toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 6)}`, startedAt: at, depth: 1, index: 0 };
  emit({ type: "run:start", runId: open.runId, at, ...(label ? { label } : {}) });
  return true;
}

/** Closes the run when the matching `beginRun` opened it. */
export function endRun(opened: boolean, outcome: { result?: string; error?: unknown }): void {
  if (!open) return;
  open.depth -= 1;
  if (!opened) return;
  const at = Date.now();
  emit({
    type: "run:end",
    runId: open.runId,
    at,
    ok: outcome.error === undefined,
    ...(outcome.result !== undefined ? { result: outcome.result } : {}),
    ...(outcome.error !== undefined ? { error: outcome.error instanceof Error ? outcome.error.message : String(outcome.error) } : {}),
    ms: at - open.startedAt,
  });
  open = undefined;
}

export function stepStarted(block: string, from: string): void {
  if (!open) return;
  const at = Date.now();
  open.step = { index: open.index++, block, startedAt: at };
  emit({ type: "step:start", runId: open.runId, at, index: open.step.index, block, from });
}

export function stepEnded(block: string, to: string): void {
  if (!open?.step) return;
  const at = Date.now();
  emit({ type: "step:end", runId: open.runId, at, index: open.step.index, block, to, ms: at - open.step.startedAt });
  open.step = undefined;
}

/** The step that started last failed. */
export function stepFailed(error: unknown): void {
  if (!open?.step) return;
  const at = Date.now();
  const { index, block, startedAt } = open.step;
  emit({ type: "step:error", runId: open.runId, at, index, block, error: error instanceof Error ? error.message : String(error), ms: at - startedAt });
  open.step = undefined;
}

export function recordArtifact(kind: "video" | "trace" | "screenshot", path: string, runId = open?.runId): void {
  if (runId) emit({ type: "run:artifact", runId, at: Date.now(), kind, path });
}

/** The last real Block inside a Block built by `connect` (or the Block itself). */
export function lastLeaf(block: object): string {
  return (block as { __wgLastLeaf?: string }).__wgLastLeaf ?? (block as { name: string }).name;
}

export function isConnected(block: object): boolean {
  return (block as { __wgLastLeaf?: string }).__wgLastLeaf !== undefined;
}
