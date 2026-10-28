// Joins Blocks into one: A's whole step (act, observe, resolve, verify, layouts) runs, then B acts on A's Checkpoint.
// A flow is its steps joined this way.
import type { Block } from "../block/block.js";
import type { SomeBlock } from "../block/some-block.js";
import type { Checkpoint } from "../checkpoint/checkpoint.js";
import type { Trait } from "../trait/trait.js";
import { runVerify, runPrecondition } from "../trait/verify.js";
import { isConnected, lastLeaf, stepEnded, stepStarted } from "./events.js";
import { blockKindOf } from "../block/kind.js";

/**
 * Structural twin of `run.ts`'s `Layout`, so this file needs no import from it. Any real `Layout` satisfies it with no
 * cast at the `connect()` call site.
 */
export interface ConnectLayout {
  name: string;
  appliesTo: (tag: string) => boolean;
  verify: Trait[] | ((out: Checkpoint<string>) => Trait[]);
}

/**
 * Composes two Blocks into one, typechecked so this only compiles when A's output
 * tag equals B's input tag. The composed Block's act runs A's full instruction
 * (act -> observe? -> resolve) then hands the resulting Checkpoint into B's act;
 * its own observe/resolve are simply B's, since B is what decides the final Out.
 *
 * `layouts`, if given, also runs against the intermediate Checkpoint (A's
 * resolved output, right before B's act) - the same enforcement `runGraph`'s
 * own loop already applies to a chain's FINAL Checkpoint, but a
 * `map()`-built Flow never reaches that loop per-hop: `buildFlow`
 * reduces the whole Block array into one `connect()`-composed super-Block, so
 * every intermediate hop's verify (and now layout) has to run HERE, inside
 * this recursive `act`, not in `runGraph`'s loop, which only ever sees the
 * one composed Block run start to finish.
 */
export function connect<
  A extends Checkpoint<string>,
  B extends Checkpoint<string>,
  C extends Checkpoint<string>,
>(a: Block<A, B>, b: Block<B, C>, layouts?: readonly ConnectLayout[]): Block<A, C>;
export function connect(a: SomeBlock, b: SomeBlock, layouts?: readonly ConnectLayout[]): SomeBlock {
  return joinSteps(a, b, layouts);
}

/**
 * {@link connect} for steps whose routes were already checked where they were chosen: a flow's steps (`map()` checks
 * each one), a composed Block's steps (its overloads do).
 */
export function joinSteps(a: SomeBlock, b: SomeBlock, layouts?: readonly ConnectLayout[]): SomeBlock {
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
        if (layouts) {
          for (const layout of layouts) {
            if (!layout.appliesTo(mid.__state)) continue;
            await runVerify(layout.verify, mid, page, mem, `${a.name} (layout: "${layout.name}")`);
          }
        }
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
  Object.defineProperty(connected, "__wgLastLeaf", { value: lastLeaf(b), enumerable: false });
  return connected;
}
