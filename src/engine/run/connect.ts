// Joins Blocks into one: A's whole step (act, observe, resolve, verify, expect) runs, then B acts on A's Checkpoint.
// A flow is its steps joined this way.
import { namingStep } from "./act-error.js";
import { mark } from "../block/mark.js";
import type { Block } from "../block/block.js";
import type { SomeBlock } from "../block/some-block.js";
import type { Checkpoint } from "../checkpoint/checkpoint.js";
import { runVerify, runPrecondition } from "../trait/verify.js";
import { syncInterrupts } from "./interrupts.js";
import { inFrameOf } from "./frame.js";
import { screenshotStep } from "./screenshot.js";
import { watchCalls } from "./calls.js";
import { readLanding } from "./landing-read.js";
import { addressOf, isConnected, lastLeaf, stepEnded, stepStarted } from "./events.js";
import { blockKindOf } from "../block/kind.js";
import { expectOf, runExpect } from "./expect.js";
import { paneName, paneOf, stepInput, stepLabel, stepLanded, stepPage } from "./pane-page.js";

/**
 * Composes two Blocks into one, typechecked so this only compiles when A's output
 * tag equals B's input tag. The composed Block's act runs A's full instruction
 * (act -> observe? -> resolve) then hands the resulting Checkpoint into B's act;
 * its own observe/resolve are simply B's, since B is what decides the final Out.
 *
 * A's verify and expectations run here, on the intermediate Checkpoint, right before B's act: a `map()`-built Flow is
 * its steps reduced into one composed Block, so `runGraph`'s loop only sees the last step's. B's expectations ride on
 * the composed Block, for that loop.
 */
export function connect<
  A extends Checkpoint<string>,
  B extends Checkpoint<string>,
  C extends Checkpoint<string>,
>(a: Block<A, B>, b: Block<B, C>): Block<A, C>;
export function connect(a: SomeBlock, b: SomeBlock): SomeBlock {
  return joinSteps(a, b);
}

/**
 * {@link connect} for steps whose routes were already checked where they were chosen: a flow's steps (`map()` checks
 * each one), a composed Block's steps (its overloads do).
 */
export function joinSteps(a: SomeBlock, b: SomeBlock): SomeBlock {
  const bObserve = b.instruction.observe;
  const bVerify = b.instruction.verify;
  const requires = [...(a.requires ?? []), ...(b.requires ?? [])];
  const connected: SomeBlock = {
    name: `${a.name} -> ${b.name}`,
    ...(requires.length > 0 ? { requires } : {}),
    instruction: {
      async act(page, input, mem) {
        // A step in a pane acts on its pane's page, from where that pane last landed; a joined step picks for its own.
        const aPage = isConnected(a) ? page : await stepPage(a, page, mem);
        const aInput = isConnected(a) ? input : stepInput(a, page, input);
        if (!isConnected(a)) stepStarted(a.name, blockKindOf(a), aInput.__state, undefined, paneName(a));
        watchCalls(aPage, paneName(a));
        await syncInterrupts(aPage, aInput.__state);
        const aScoped = inFrameOf(aPage, aInput.__state);
        await runPrecondition(a.instruction.precondition, aInput, aScoped, mem, stepLabel(a));
        try {
          await a.instruction.act(aScoped, aInput, mem);
        } catch (err) {
          throw namingStep(err, stepLabel(a));
        }
        // Where A landed is its last step's page.
        const aLeaf = await stepPage(a, page, mem);
        const aObserved = a.instruction.observe
          ? await a.instruction.observe(inFrameOf(aLeaf, aInput.__state), mem)
          : undefined;
        const mid = await a.instruction.resolve(aObserved);
        stepLanded(a, page, mid);
        const aLanded = inFrameOf(aLeaf, mid.__state);
        await runVerify(a.instruction.verify, mid, aLanded, mem, stepLabel(a));
        await runExpect(a, mid, aLanded, mem, lastLeaf(a));
        await readLanding(aLanded, mem, mid.__state);
        await screenshotStep(aLeaf, a, mid.__state, lastLeaf(a));
        stepEnded(lastLeaf(a), mid.__state, addressOf(aLeaf));
        const bPage = isConnected(b) ? page : await stepPage(b, page, mem);
        const bInput = isConnected(b) ? mid : stepInput(b, page, mid);
        if (!isConnected(b)) stepStarted(b.name, blockKindOf(b), bInput.__state, undefined, paneName(b));
        watchCalls(bPage, paneName(b));
        await syncInterrupts(bPage, bInput.__state);
        const bScoped = inFrameOf(bPage, bInput.__state);
        await runPrecondition(b.instruction.precondition, bInput, bScoped, mem, stepLabel(b));
        try {
          await b.instruction.act(bScoped, bInput, mem);
        } catch (err) {
          throw namingStep(err, stepLabel(b));
        }
      },
      resolve: (observed) => b.instruction.resolve(observed),
      // Only attach optional fields when B actually has them - exactOptionalPropertyTypes
      // forbids assigning `undefined` to an optional property directly. The run loop passes the pages it plays on; B
      // observes on its pane's.
      ...(bObserve ? { observe: async (page, mem) => bObserve(await stepPage(b, page, mem), mem) } : {}),
      ...(bVerify ? { verify: bVerify } : {}),
    },
  };
  mark(connected, "__wgLastLeaf", lastLeaf(b));
  // The joined step lands where B does: in B's pane.
  const bPane = paneOf(b);
  if (bPane) mark(connected, "__waygraphPane", bPane);
  const bExpect = expectOf(b);
  if (bExpect) mark(connected, "__waygraphExpect", bExpect);
  return connected;
}
