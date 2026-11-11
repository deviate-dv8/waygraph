// Run events: what happened, step by step, during a run. Core emits them; subscribers (the run log, the demo overlay,
// reports, Waygraph UI) listen. Emitting never throws into the run.
import { stepMessageOf } from "./act-error.js";
import { AsyncLocalStorage } from "node:async_hooks";
import type { BlockKind } from "../block/kind.js";
import type { TraitCheckReport } from "../trait/verify.js";
import type { Page } from "@playwright/test";

export type RunEvent =
  | { type: "run:start"; runId: string; at: number; label?: string }
  /** The mem a segment of the run was seeded with (`--data`, mem stubs): what `--replay <runId>` sets again. */
  | { type: "run:mem"; runId: string; at: number; segment: number; flow: string; values: Record<string, unknown> }
  | { type: "step:start"; runId: string; at: number; index: number; block: string; kind: BlockKind; from: string; parent?: number; cleanup?: true; pane?: string }
  /** `url`: the page's address when the step ended (where it navigated to). */
  | { type: "step:end"; runId: string; at: number; index: number; block: string; kind: BlockKind; to: string; ms: number; url?: string }
  | { type: "step:error"; runId: string; at: number; index: number; block: string; kind: BlockKind; error: string; ms: number; check?: TraitCheckReport }
  | ({ type: "step:read"; runId: string; at: number; index: number; block: string; kind: BlockKind; checkpoint: string } & StepRead)
  | { type: "run:end"; runId: string; at: number; ok: boolean; result?: string; error?: string; ms: number }
  /** A compared run (`--compare`): where its two sides differed after step `block` (the `step`-th of each). */
  | { type: "compare:diff"; runId: string; at: number; step: number; block: string; sides: [string, string]; diffs: StepDiff[]; indexes?: [number, number] }
  /** `index`, `block`, `checkpoint`: the step a screenshot ends, and where the page was. */
  | { type: "run:artifact"; runId: string; at: number; kind: "video" | "trace" | "screenshot"; path: string; index?: number; block?: string; checkpoint?: string };

/** One way two compared sides differed after a step: where they landed, whether it passed, or what a page field read. */
export interface StepDiff {
  what: "landed" | "outcome" | "read";
  /** The field (`cart.total`) for a read. */
  key?: string;
  values: [unknown, unknown];
}

/** What the page showed after a step, from the Read Blocks for the Checkpoint it landed on. */
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

export function stepStarted(block: string, kind: BlockKind, from: string, cleanup?: boolean, pane?: string): void {
  const open = scope.getStore();
  if (!open) return;
  const at = Date.now();
  const parent = open.open.at(-1)?.index;
  const step = { index: open.index++, block, kind, startedAt: at };
  open.open.push(step);
  emit({ type: "step:start", runId: open.runId, at, index: step.index, block, kind, from, ...(parent !== undefined ? { parent } : {}), ...(cleanup ? { cleanup: true as const } : {}), ...(pane ? { pane } : {}) });
}

/** The page's address now, for a step's end; a stand-in page with no `url()` (a test's) has none. */
export function addressOf(page: Page): string | undefined {
  return typeof (page as { url?: unknown }).url === "function" ? page.url() : undefined;
}

/**
 * The step named `block` ended at `to`, with the page at `url`. Steps still open inside it end with it: a fast-forward
 * step's last inner step lands where the fast-forward step lands.
 */
export function stepEnded(block: string, to: string, url?: string): void {
  const open = scope.getStore();
  if (!open?.open.length) return;
  // The innermost open step with this name; the last one when none has it.
  const named = open.open.map((s) => s.block).lastIndexOf(block);
  const found = named === -1 ? open.open.length - 1 : named;
  const at = Date.now();
  for (const step of open.open.splice(found).reverse()) {
    emit({ type: "step:end", runId: open.runId, at, index: step.index, block: step.block, kind: step.kind, to, ms: at - step.startedAt, ...(url ? { url } : {}) });
  }
}

/** What the page showed after the current step (emitted between its verify and its `step:end`). */
export function stepRead(checkpoint: string, read: StepRead): void {
  const run = scope.getStore();
  const step = run?.open.at(-1);
  if (!run || !step) return;
  emit({ type: "step:read", runId: run.runId, at: Date.now(), index: step.index, block: step.block, kind: step.kind, checkpoint, ...read });
}

/** The step that started last failed, and every step still open around it (a fast-forward step with its inner step). */
export function stepFailed(error: unknown): void {
  const open = scope.getStore();
  if (!open?.open.length) return;
  const at = Date.now();
  // A failed check also says, as data, what it wanted, what the page showed and where (TraitFailure).
  const check = (error as { check?: TraitCheckReport } | null)?.check;
  const message = stepMessageOf(error);
  for (const { index, block, kind, startedAt } of open.open.splice(0).reverse()) {
    emit({ type: "step:error", runId: open.runId, at, index, block, kind, error: message, ms: at - startedAt, ...(check ? { check } : {}) });
  }
}

/** Records where the two sides of a compared run differed after a step. */
export function recordDiff(step: number, block: string, sides: [string, string], diffs: StepDiff[], indexes?: [number, number]): void {
  const open = scope.getStore();
  if (!open) return;
  emit({ type: "compare:diff", runId: open.runId, at: Date.now(), step, block, sides, diffs, ...(indexes ? { indexes } : {}) });
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

export function recordArtifact(
  kind: "video" | "trace" | "screenshot",
  path: string,
  runId = scope.getStore()?.runId,
  step?: { index: number; block: string; checkpoint: string },
): void {
  if (runId) emit({ type: "run:artifact", runId, at: Date.now(), kind, path, ...(step ?? {}) });
}

/** The run and the step open right now (the innermost one), if any. */
export function currentStep(): { runId: string; index: number } | undefined {
  const run = scope.getStore();
  const step = run?.open.at(-1);
  return run && step ? { runId: run.runId, index: step.index } : undefined;
}

/** The last real Block inside a Block built by `connect` (or the Block itself). */
export function lastLeaf(block: object): string {
  return (block as { __wgLastLeaf?: string }).__wgLastLeaf ?? (block as { name: string }).name;
}

export function isConnected(block: object): boolean {
  return (block as { __wgLastLeaf?: string }).__wgLastLeaf !== undefined;
}
