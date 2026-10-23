// An Effect: a page action on one of several live instances (add this item, remove that row); `waygraph auto` offers one menu row per instance.
import type { Block, DefinedBlock } from "../block.js";
import type { Checkpoint } from "../../checkpoint/checkpoint.js";
import type { MemKey } from "../../mem/mem.js";
import type { Trait } from "../../trait/trait.js";
import { defineBlock } from "../block.js";
import { markRouteOf, routed } from "../../checkpoint/route.js";
import type { RoutedBlockBase } from "../../checkpoint/route.js";

/**
 * TypeScript salt over {@link defineBlock}: same runtime Block, but the type
 * forces `requires` + `instanceOptions` so `waygraph auto` can list one menu
 * row per live instance (add/remove/toggle). Not a separate engine concept -
 * everything is still a Block.
 */
export type EffectBlock<
  In extends Checkpoint<string>,
  Out extends Checkpoint<string>,
> = Omit<
  DefinedBlock<In, Out>,
  "withVerify" | "modVerify" | "modVerifyAll" | "stubBefore" | "stubAfter" | "stubOnError"
> & {
  readonly __wgFactory?: "effect";
  requires: readonly MemKey<unknown>[];
  instanceOptions: NonNullable<Block<In, Out>["instanceOptions"]>;
  withVerify(
    verify: Trait[] | ((out: Out) => Trait[]),
  ): EffectBlock<In, Out>;
  modVerify(
    nameOrIndex: string | number,
    newCheck: Trait["check"] | Trait,
  ): EffectBlock<In, Out>;
  modVerifyAll(patches: Record<string, Trait["check"] | Trait>): EffectBlock<In, Out>;
  stubBefore(stub: import("../../narration.js").HighlightStubPhase): EffectBlock<In, Out>;
  stubBefore(stub: import("../../narration.js").StubLifecycleFn<Out>): EffectBlock<In, Out>;
  stubAfter(stub: import("../../narration.js").HighlightStubPhase): EffectBlock<In, Out>;
  stubAfter(stub: import("../../narration.js").StubLifecycleFn<Out>): EffectBlock<In, Out>;
  stubOnError(stub: import("../../narration.js").HighlightStubPhase): EffectBlock<In, Out>;
  stubOnError(stub: import("../../narration.js").StubLifecycleFn<Out>): EffectBlock<In, Out>;
};


/**
 * {@link defineBlock} constrained for effect-style instance menus: `requires` +
 * `instanceOptions` are mandatory. Prefer this when the Block adds / removes /
 * toggles a live instance rather than navigating. Runtime result is an ordinary
 * Block - the helper is TypeScript salt only.
 */
type EffectExtras<In extends Checkpoint<string>, Out extends Checkpoint<string>> = {
  requires: readonly MemKey<unknown>[];
  instanceOptions: NonNullable<Block<In, Out>["instanceOptions"]>;
};

export function defineEffectBlock<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  base: RoutedBlockBase<In, Out> & EffectExtras<In, Out>,
): EffectBlock<In, Out> {
  const built = defineBlock(routed(base) as Parameters<typeof defineBlock<In, Out>>[0]) as EffectBlock<In, Out>;
  markRouteOf(built, base);
  Object.defineProperty(built, "__waygraphMemKind", {
    value: "effect",
    enumerable: false,
    configurable: false,
  });
  Object.defineProperty(built, "__waygraphSalt", {
    value: "effect",
    enumerable: false,
    configurable: false,
  });
  return built;
}

