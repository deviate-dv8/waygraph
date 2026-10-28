// branch(): a Block that routes on the Checkpoint it resolved to.
import type { Checkpoint } from "../checkpoint/checkpoint.js";
import type { Block, DefinedBlock } from "./block.js";
import type { BlockFrom, SomeBlock } from "./some-block.js";
import { copyWaygraphRuntime, defineBlock, stripMethods } from "./block.js";


/**
 * Attaches routing to `block` without touching its act/observe/resolve/verify -
 * `routes` must cover every tag of `block`'s output (a missing route is a compile
 * error), and the returned Block runs exactly as `block` always did, just followed
 * by whichever next Block the resolved tag routes to. `null` for a tag means that
 * tag is terminal - the run stops there, same as a Block with no routing at all.
 * A route pointing back at `block` itself is a self-loop; see `runGraph`'s
 * `maxSteps` for its safety net. The result ends on any Checkpoint (`Checkpoint<string>`):
 * a route can lead anywhere, including back through itself, so there is no fixed
 * Out type to express; state the expected outcomes to `runGraph` via `terminals`
 * instead. Each route's Block must start from the tag it routes on.
 */


export function branch<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  block: Block<In, Out>,
  routes: {
    [K in Out["__state"]]: BlockFrom<Extract<Out, Checkpoint<K>>> | null;
  }
): DefinedBlock<In, Checkpoint<string>> {
  const base = stripMethods(widenOut(block));
  let routed!: DefinedBlock<In, Checkpoint<string>>;
  const routesAsData: Record<string, string | null> = {};
  for (const [tag, target] of Object.entries(routes as Readonly<Record<string, SomeBlock | null>>)) {
    routesAsData[tag] = target === null ? null : target === block ? base.name : target.name;
  }
  routed = defineBlock({
    ...base,
    next: (checkpoint: Checkpoint<string>) => {
      const target = (routes as Readonly<Record<string, SomeBlock | null>>)[checkpoint.__state];
      if (target === undefined || target === null) return undefined;
      // A route naming `block` itself (the only self-reference in scope when
      // `routes` was written) means "loop back with routing intact" - substitute
      // the routed Block, not the original with no `next` of its own.
      return target === block ? routed : target;
    },
    routes: routesAsData,
  });
  // Without this, branch()'s output carried no __waygraphKind/__waygraphSalt at all (defineBlock
  // never stamps them - factories do, after defineBlock returns), so a branched Block could never
  // pass MapBuilder's assertMapKind/assertMapSalt checks. Real bug: branching was unusable from the
  // Waygraph Map, only from a raw runGraph() call.
  copyWaygraphRuntime(block, routed);
  return routed;
}


/**
 * The same Block, typed as ending on any Checkpoint: for routing, where whatever follows decides where the run ends.
 * Nothing changes at run time, and its own `verify` and stubs are still only called with what its own `resolve`
 * returned, which is an `Out`.
 */
function widenOut<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  block: Block<In, Out>,
): Block<In, Checkpoint<string>> {
  return block as unknown as Block<In, Checkpoint<string>>;
}
