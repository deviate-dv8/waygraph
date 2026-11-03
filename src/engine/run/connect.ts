// Joins Blocks into one: A's whole step (act, observe, resolve, verify, expect) runs, then B acts on A's Checkpoint.
// A flow is its steps joined this way.
import { mark } from "../block/mark.js";
import type { Block } from "../block/block.js";
import type { SomeBlock } from "../block/some-block.js";
import type { Checkpoint } from "../checkpoint/checkpoint.js";
import { runVerify, runPrecondition } from "../trait/verify.js";
import { isConnected, lastLeaf, stepEnded, stepStarted } from "./events.js";
import { blockKindOf } from "../block/kind.js";
import { expectOf, runExpect } from "./expect.js";

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
        if (!isConnected(a)) stepStarted(a.name, blockKindOf(a), input.__state);
        await runPrecondition(a.instruction.precondition, input, page, mem, a.name);
        await a.instruction.act(page, input, mem);
        const aObserved = a.instruction.observe
          ? await a.instruction.observe(page, mem)
          : undefined;
        const mid = await a.instruction.resolve(aObserved);
        await runVerify(a.instruction.verify, mid, page, mem, a.name);
        await runExpect(a, mid, page, mem, lastLeaf(a));
        stepEnded(lastLeaf(a), mid.__state);
        if (!isConnected(b)) stepStarted(b.name, blockKindOf(b), mid.__state);
        await runPrecondition(b.instruction.precondition, mid, page, mem, b.name);
        await b.instruction.act(page, mid, mem);
      },
      resolve: (observed) => b.instruction.resolve(observed),
      // Only attach optional fields when B actually has them - exactOptionalPropertyTypes
      // forbids assigning `undefined` to an optional property directly.
      ...(bObserve ? { observe: (page, mem) => bObserve(page, mem) } : {}),
      ...(bVerify ? { verify: bVerify } : {}),
    },
  };
  mark(connected, "__wgLastLeaf", lastLeaf(b));
  const bExpect = expectOf(b);
  if (bExpect) mark(connected, "__waygraphExpect", bExpect);
  return connected;
}
