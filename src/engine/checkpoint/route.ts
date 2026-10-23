// A routed Block says where it runs: `from` (one Checkpoint, a list, or anywhere) and `to`; the route is kept on the Block for the manifest.
import type { Checkpoint } from "./checkpoint.js";
import { checkpoint } from "./checkpoint.js";
import type { defineBlock } from "../block/block.js";

/** Tags of one Checkpoint or a list of them. */
export function tagsOf(refs: Checkpoint<string> | readonly Checkpoint<string>[]): string[] {
  return (Array.isArray(refs) ? refs : [refs as Checkpoint<string>]).map((r) => r.__state);
}

/**
 * Records where a Block runs from and lands on, as tags, so the manifest can read the graph at runtime. `from` of `["*"]`
 * means reachable from anywhere.
 */
export function markRoute(block: object, from: readonly string[], to: readonly string[]): void {
  Object.defineProperty(block, "__waygraphFrom", { value: [...from], enumerable: false, configurable: true });
  Object.defineProperty(block, "__waygraphTo", { value: [...to], enumerable: false, configurable: true });
}

export type BlockBase<In extends Checkpoint<string>, Out extends Checkpoint<string>> = Parameters<typeof defineBlock<In, Out>>[0];

/**
 * A Method or Effect that says where it runs: `from` (one Checkpoint value or a list; leave it out for "from anywhere") and
 * `to`. `resolve` may be left out when `to` is one Checkpoint; it then always lands there.
 */
export type RoutedBlockBase<In extends Checkpoint<string>, Out extends Checkpoint<string>> = Omit<BlockBase<In, Out>, "instruction"> & {
  from?: In | readonly In[];
  to: Out | readonly Out[];
  instruction: Omit<BlockBase<In, Out>["instruction"], "resolve" | "stubBefore" | "stubAfter" | "stubOnError"> & {
    resolve?: BlockBase<In, Out>["instruction"]["resolve"];
  };
};

/** Turns a `from`/`to` Block base into the plain one `defineBlock` takes (filling `resolve` for a single `to`). */
export function routed<In extends Checkpoint<string>, Out extends Checkpoint<string>>(base: RoutedBlockBase<In, Out>): BlockBase<In, Out> {
  const { from: _from, to, ...rest } = base;
  if (rest.instruction.resolve) return rest as BlockBase<In, Out>;
  const targets = tagsOf(to);
  if (targets.length !== 1) {
    throw new Error(`waygraph: Block "${base.name}" lands on ${targets.join(" or ")}; give it a resolve() that picks one`);
  }
  return { ...rest, instruction: { ...rest.instruction, resolve: () => checkpoint(targets[0]!) as Out } } as BlockBase<In, Out>;
}

/** Records a routed Block's `from`/`to` on the built Block. */
export function markRouteOf(block: object, base: { from?: Checkpoint<string> | readonly Checkpoint<string>[]; to: Checkpoint<string> | readonly Checkpoint<string>[] }): void {
  markRoute(block, base.from === undefined ? ["*"] : tagsOf(base.from), tagsOf(base.to));
}
