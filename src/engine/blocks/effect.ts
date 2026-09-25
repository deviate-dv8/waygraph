// Split out of the former 2,900-line engine.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import type { Block, Checkpoint, DefinedBlock } from "../../types.js";
import type { MemKey } from "../../mem-page.js";
import type { Trait } from "../../trait.js";
import { defineBlock } from "../core.js";

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
  requires: readonly MemKey<any>[];
  instanceOptions: NonNullable<Block<In, Out>["instanceOptions"]>;
  withVerify(
    verify: Trait[] | ((out: Out) => Trait[]),
  ): EffectBlock<In, Out>;
  modVerify(
    nameOrIndex: string | number,
    newCheck: Trait["check"] | Trait,
  ): EffectBlock<In, Out>;
  modVerifyAll(patches: Record<string, Trait["check"] | Trait>): EffectBlock<In, Out>;
  stubBefore(stub: import("../../highlights.js").HighlightStubPhase): EffectBlock<In, Out>;
  stubBefore(stub: import("../../highlights.js").StubLifecycleFn<Out>): EffectBlock<In, Out>;
  stubBefore(
    stub: (out: Out) => import("../../highlights.js").HighlightStubPhase,
  ): EffectBlock<In, Out>;
  stubAfter(stub: import("../../highlights.js").HighlightStubPhase): EffectBlock<In, Out>;
  stubAfter(stub: import("../../highlights.js").StubLifecycleFn<Out>): EffectBlock<In, Out>;
  stubAfter(
    stub: (out: Out) => import("../../highlights.js").HighlightStubPhase,
  ): EffectBlock<In, Out>;
  stubOnError(stub: import("../../highlights.js").HighlightStubPhase): EffectBlock<In, Out>;
  stubOnError(stub: import("../../highlights.js").StubLifecycleFn<Out>): EffectBlock<In, Out>;
  stubOnError(
    stub: (out: Out) => import("../../highlights.js").HighlightStubPhase,
  ): EffectBlock<In, Out>;
};


/** @deprecated Prefer {@link EffectBlock} - same type; Mem* was an early name. */
export type MemEffectBlock<
  In extends Checkpoint<string>,
  Out extends Checkpoint<string>,
> = EffectBlock<In, Out>;


/**
 * {@link defineBlock} constrained for effect-style instance menus: `requires` +
 * `instanceOptions` are mandatory. Prefer this when the Block adds / removes /
 * toggles a live instance rather than navigating. Runtime result is an ordinary
 * Block - the helper is TypeScript salt only.
 */
export function defineEffectBlock<
  In extends Checkpoint<string>,
  Out extends Checkpoint<string>,
>(
  base: Parameters<typeof defineBlock<In, Out>>[0] & {
    requires: readonly MemKey<any>[];
    instanceOptions: NonNullable<Block<In, Out>["instanceOptions"]>;
  },
): EffectBlock<In, Out> {
  const built = defineBlock(base) as EffectBlock<In, Out>;
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


/** @deprecated Prefer {@link defineEffectBlock} - identical helper. */
export const defineMemEffectBlock = defineEffectBlock;
