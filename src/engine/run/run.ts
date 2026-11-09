// runGraph: plays Blocks on a page. For each Block: precondition -> act -> observe -> resolve (which Checkpoint did we
// reach?) -> verify (is the page really there?) -> expect (what the scenario expects), then follows `next` for a branched Block. Emits run events.
import { MemPage } from "../mem/mem.js";
import { WaygraphError, MSG_PREFLIGHT_MISSING_KEY, MSG_RUNGRAPH_MAX_STEPS, MSG_RUNGRAPH_NOT_TERMINAL, messageOf } from "../errors.js";
import { Start } from "../checkpoint/checkpoint.js";
import type { Block } from "../block/block.js";
import type { Checkpoint } from "../checkpoint/checkpoint.js";
import { runExpect } from "./expect.js";
import { screenshotStep } from "./screenshot.js";
import { addressOf, inRun, isConnected, lastLeaf, stepEnded, stepFailed, stepRead, stepStarted } from "./events.js";
import { readBlocksFor, readCheckpoint } from "../read/read-block.js";
import { blockKindOf } from "../block/kind.js";
import { runPrecondition, runVerify } from "../trait/verify.js";
import type { BrowserContext, Page } from "@playwright/test";
import type { SomeBlock } from "../block/some-block.js";

/**
 * Checks `block.requires` against `mem` and throws, naming every missing key at
 * once, if any are unset. `connect()` unions each Block's `requires` into the
 * composed Block, so calling this on a `map()`-built Flow's entry - which
 * `runGraph` does automatically, before opening a tab - covers every Block in
 * that flow. It does not see Blocks only reachable through `branch()` routing,
 * since those depend on a runtime decision that hasn't happened yet.
 */
export function preflight(mem: MemPage, block: SomeBlock): void {
  const missing = (block.requires ?? []).filter((k) => !mem.has(k));
  if (missing.length > 0) {
    throw new WaygraphError(
      "WG_PREFLIGHT_MISSING_KEY",
      MSG_PREFLIGHT_MISSING_KEY(block.name, missing.map((k) => `"${k.name}"`).join(", ")),
    );
  }
}


/**
 * Runs `entry` against a fresh tab and returns the resulting terminal Checkpoint.
 * The engine owns the tab's lifecycle, not any individual Block: the tab is
 * created before the first `act` runs and closed in `finally`, so it closes even
 * if a step throws.
 *
 * After each Block resolves, its `next` (if any, from `branch()`) is followed to
 * the following Block, in the same tab - a Block with no `next` runs exactly once,
 * unchanged from before `branch()` existed. `next` returning the same Block is a
 * self-loop; `maxSteps` bounds the loop so a routing bug fails loud instead of
 * hanging.
 *
 * `terminals`, if given, is a sanity check: the Checkpoint the run stops on must be
 * one of the tags the caller actually expects, or the run fails loud instead of
 * silently returning an unexpected result. Omit it when there is only ever one
 * reachable outcome by construction (as with a `map()`-built Flow, which has
 * no routing at all) - there is nothing to validate against.
 */
export async function runGraph<TOut extends Checkpoint<string>>(
  entry: Block<Start, TOut>,
  terminals: ReadonlySet<string> | undefined,
  context: BrowserContext,
  mem: MemPage,
  maxSteps = 5000,
  options?: RunGraphOptions,
): Promise<TOut> {
  // The walk ends on a Checkpoint some Block resolved to: the entry's TOut, or one its routes lead to.
  return (await runSteps(entry, terminals, context, mem, maxSteps, options)) as TOut;
}

/** {@link runGraph} for a Block whose route was checked where it was built (a flow's joined steps). */
export async function runSteps(
  entry: SomeBlock,
  terminals: ReadonlySet<string> | undefined,
  context: BrowserContext,
  mem: MemPage,
  maxSteps = 5000,
  options?: RunGraphOptions,
): Promise<Checkpoint<string>> {
  preflight(mem, entry);
  const page = options?.page ?? (await context.newPage());
  const closeOnFinish = options?.closeOnFinish ?? true;
  return inRun(undefined, () => playGraph(entry, terminals, page, mem, maxSteps, options), (out) => out.__state).finally(async () => {
    if (closeOnFinish) await page.close();
  });
}

/** The step loop of {@link runGraph}, inside its run: act, observe, resolve, verify, then the next Block. */
async function playGraph(
  entry: SomeBlock,
  terminals: ReadonlySet<string> | undefined,
  page: Page,
  mem: MemPage,
  maxSteps: number,
  options: RunGraphOptions | undefined,
): Promise<Checkpoint<string>> {
  try {
    let current: SomeBlock = entry;
    let input: Checkpoint<string> = options?.from ?? Start;
    let steps = 0;

    for (;;) {
      if (++steps > maxSteps) {
        throw new WaygraphError("WG_RUNGRAPH_MAX_STEPS", MSG_RUNGRAPH_MAX_STEPS(maxSteps));
      }

      if (!isConnected(current)) stepStarted(current.name, blockKindOf(current), input.__state, (current as { __waygraphCleanup?: boolean }).__waygraphCleanup);
      await runPrecondition(current.instruction.precondition, input, page, mem, current.name);
      await current.instruction.act(page, input, mem);
      const observed = current.instruction.observe
        ? await current.instruction.observe(page, mem)
        : undefined;
      const checkpoint = await current.instruction.resolve(observed);

      await runVerify(current.instruction.verify, checkpoint, page, mem, current.name);
      await runExpect(current, checkpoint, page, mem, lastLeaf(current));
      await readLanding(page, mem, checkpoint.__state);
      // Last in the step: what the page looks like once it's done, when the Block asks.
      await screenshotStep(page, current, checkpoint.__state, lastLeaf(current));
      stepEnded(lastLeaf(current), checkpoint.__state, addressOf(page));

      const next = current.next?.(checkpoint);
      if (!next) {
        if (terminals && !terminals.has(checkpoint.__state)) {
          throw new WaygraphError(
            "WG_RUNGRAPH_NOT_TERMINAL",
            MSG_RUNGRAPH_NOT_TERMINAL(current.name, checkpoint.__state, [...terminals].join(", ")),
          );
        }
        return checkpoint;
      }

      current = next;
      input = checkpoint;
    }
  } catch (err) {
    stepFailed(err);
    throw err;
  }
}


/** Options for `runGraph`'s trailing `options` arg and for {@link Flow.run}'s `options` overload. */
export interface RunGraphOptions {
  /**
   * Drive this already-open page instead of opening a new one via
   * `context.newPage()`. Lets a run continue on a tab the caller already
   * has open (e.g. one that's already logged in), instead of every run
   * being forced to start its own fresh tab and lose access to whatever was
   * already there.
   */
  page?: Page;
  /**
   * `Flow.run` defaults this to `true` only when it opened the page itself
   * (no `page` given) - matching every call from before this option
   * existed. If you pass your own `page`, it defaults to `false` instead:
   * a page you opened is yours to close, not this run's to close out from
   * under you. Either way an explicit value here always wins. `runGraph`
   * itself has no such page-aware default (its caller already decided
   * `page` and `closeOnFinish` together) - it just does what you ask.
   */
  closeOnFinish?: boolean;
  /**
   * The Checkpoint the run starts on: its first Block's input. Default `Start`. A runner that plays a flow one step at a
   * time passes where the last step landed, so a step that stays where it is (`.set`, `.expect`, a skipped `when`) stays
   * there, not at the start.
   */
  from?: Checkpoint<string>;
}


/**
 * Drives a genuinely separate second tab through its own Block/Flow, in the
 * same browser context an existing `page` already belongs to - the primitive
 * `observe()` is specifically allowed to reach for (see {@link Instruction.observe}),
 * since `act`/`resolve` can't touch `page.context()` at all. A thin, named
 * wrapper around `runGraph` (which already opens its own page from whatever
 * context it's given) rather than a new mechanism - the point is making the
 * pattern discoverable and giving it a real name, not inventing new tab-lifecycle
 * logic. The spawned tab is closed (by `runGraph`'s own `finally`) before this
 * resolves; the original `page` is never touched.
 * @example
 * async observe(page, mem) {
 *   const receipt = await spawnTab(EmailReceiptFlow, page, mem);
 *   mem.set(ReceiptCode, receipt.__state);
 * }
 */
export async function spawnTab<TOut extends Checkpoint<string>>(
  entry: Block<Start, TOut>,
  page: Page,
  mem: MemPage,
  maxSteps = 5000,
): Promise<TOut> {
  return runGraph<TOut>(entry, undefined, page.context(), mem, maxSteps);
}

/** After a step's verify: what the page shows, from the Read Blocks for where it landed (none loaded: nothing to do). */
async function readLanding(page: Page, mem: MemPage, checkpoint: string): Promise<void> {
  if (readBlocksFor(checkpoint).length === 0) return;
  try {
    const { read, blocks } = await readCheckpoint(page, mem, checkpoint);
    stepRead(checkpoint, { read: read.toJSON(), missing: [...read.missing], notes: { ...read.notes }, readBlocks: blocks });
  } catch (err) {
    // A broken Read Block is reported on the step, never fails the run it observes.
    stepRead(checkpoint, { read: {}, missing: [], notes: {}, readBlocks: [], error: messageOf(err) });
  }
}
