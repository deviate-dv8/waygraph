// Run events: what happened, step by step, during a run. Core emits them; subscribers (the run log, the demo overlay,
// reports, Waygraph UI) listen. Emitting never throws into the run.
import { AsyncLocalStorage } from "node:async_hooks";
import type { BlockKind } from "../block/kind.js";
import type { TraitCheckReport } from "../trait/verify.js";

export type RunEvent =
  | { type: "run:start"; runId: string; at: number; label?: string }
  /** The mem a segment of the run was seeded with (`--data`, mem stubs): what `--replay <runId>` sets again. */
  | { type: "run:mem"; runId: string; at: number; segment: number; flow: string; values: Record<string, unknown> }
  | { type: "step:start"; runId: string; at: number; index: number; block: string; kind: BlockKind; from: string; parent?: number; cleanup?: true }
  | { type: "step:end"; runId: string; at: number; index: number; block: string; kind: BlockKind; to: string; ms: number }
  | { type: "step:error"; runId: string; at: number; index: number; block: string; kind: BlockKind; error: string; ms: number; check?: TraitCheckReport }
  | ({ type: "step:read"; runId: string; at: number; index: number; block: string; kind: BlockKind; checkpoint: string } & StepRead)
  | { type: "run:end"; runId: string; at: number; ok: boolean; result?: string; error?: string; ms: number }
  | { type: "run:artifact"; runId: string; at: number; kind: "video" | "trace" | "screenshot"; path: string };

/** What the page showed after a step, from the Read Blocks for the Checkpoint it landed on (beta). */
export interface StepRead {
  read: Record<string, unknown>;
  missing: string[];
  notes: Record<string, string>;
  readBlocks: string[];
  /** A Read Block that failed (two reading one key, say): the step still ran; the read is empty. */
  error?: string;
}

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
  /** Steps started and not yet ended, innermost last: a fast-forward step holds the inner steps it plays. */
  open: OpenStep[];
}

interface OpenStep {
  index: number;
  block: string;
  kind: BlockKind;
  startedAt: number;
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
  const run: OpenRun = { runId: `${new Date(at).toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`, startedAt: at, index: 0, open: [] };
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

export function stepStarted(block: string, kind: BlockKind, from: string, cleanup?: boolean): void {
  const open = scope.getStore();
  if (!open) return;
  const at = Date.now();
  const parent = open.open.at(-1)?.index;
  const step = { index: open.index++, block, kind, startedAt: at };
  open.open.push(step);
  emit({ type: "step:start", runId: open.runId, at, index: step.index, block, kind, from, ...(parent !== undefined ? { parent } : {}), ...(cleanup ? { cleanup: true as const } : {}) });
}

/**
 * The step named `block` ended at `to`. Steps still open inside it end with it: a fast-forward step's last inner step
 * lands where the fast-forward step lands.
 */
export function stepEnded(block: string, to: string): void {
  const open = scope.getStore();
  if (!open?.open.length) return;
  let found = open.open.length - 1;
  while (found > 0 && open.open[found]!.block !== block) found--;
  if (open.open[found]!.block !== block) found = open.open.length - 1;
  const at = Date.now();
  for (const step of open.open.splice(found).reverse()) {
    emit({ type: "step:end", runId: open.runId, at, index: step.index, block: step.block, kind: step.kind, to, ms: at - step.startedAt });
  }
}

/** What the page showed after the current step (emitted between its verify and its `step:end`). */
export function stepRead(checkpoint: string, read: StepRead): void {
  const step = scope.getStore()?.open.at(-1);
  if (!step) return;
  emit({ type: "step:read", runId: scope.getStore()!.runId, at: Date.now(), index: step.index, block: step.block, kind: step.kind, checkpoint, ...read });
}

/** The step that started last failed, and every step still open around it (a fast-forward step with its inner step). */
export function stepFailed(error: unknown): void {
  const open = scope.getStore();
  if (!open?.open.length) return;
  const at = Date.now();
  // A failed check also says, as data, what it wanted, what the page showed and where (TraitFailure).
  const check = (error as { check?: TraitCheckReport } | null)?.check;
  const message = error instanceof Error ? error.message : String(error);
  for (const { index, block, kind, startedAt } of open.open.splice(0).reverse()) {
    emit({ type: "step:error", runId: open.runId, at, index, block, kind, error: message, ms: at - startedAt, ...(check ? { check } : {}) });
  }
}

/** Records the mem a segment of this run was seeded with, keyed by MemKey name. */
export function recordMem(segment: number, flow: string, values: Record<string, unknown>): void {
  const open = scope.getStore();
  if (!open) return;
  emit({ type: "run:mem", runId: open.runId, at: Date.now(), segment, flow, values });
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
