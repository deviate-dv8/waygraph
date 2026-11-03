// A Method: a page action that doesn't navigate (fill, submit, toggle), from one Checkpoint to another.
import { mark } from "../mark.js";
import type { Checkpoint } from "../../checkpoint/checkpoint.js";
import type { DefinedBlock } from "../block.js";
import type { Trait } from "../../trait/trait.js";
import { defineBlock } from "../block.js";
import { markRouteOf, routed } from "../../checkpoint/route.js";
import { markExpect } from "../../run/expect.js";
import type { RoutedBlockBase } from "../../checkpoint/route.js";

/**
 * TypeScript salt over {@link defineBlock} for one-shot non-nav app steps
 * (submit, upload, finish, logout) - **methods** on a page. Same runtime Block;
 * marks `__waygraphSalt = "method"` so auto/docs can tell Method from bare
 * {@link defineBlock}. Does not force `instanceOptions` - use
 * {@link defineEffectBlock} when the auto menu should spawn one row per live
 * DOM instance. Prefer hanging methods off a {@link definePageBlock} hub.
 */
export type MethodBlock<
  In extends Checkpoint<string>,
  Out extends Checkpoint<string>,
> = Omit<
  DefinedBlock<In, Out>,
  "withVerify" | "modVerify" | "modVerifyAll" | "stubBefore" | "stubAfter" | "stubOnError"
> & {
  readonly __wgFactory?: "method";
  withVerify(
    verify: Trait[] | ((out: Out) => Trait[]),
  ): MethodBlock<In, Out>;
  modVerify(
    nameOrIndex: string | number,
    newCheck: Trait["check"] | Trait,
  ): MethodBlock<In, Out>;
  modVerifyAll(patches: Record<string, Trait["check"] | Trait>): MethodBlock<In, Out>;
  stubBefore(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): MethodBlock<In, Out>;
  stubAfter(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): MethodBlock<In, Out>;
  stubOnError(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): MethodBlock<In, Out>;
};


/** Builds a Block for one page action (fill, submit, click) that does not navigate. */
export function defineMethodBlock<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  base: RoutedBlockBase<In, Out>,
): MethodBlock<In, Out> {
  const built = defineBlock(routed(base)) as MethodBlock<In, Out>;
  markRouteOf(built, base);
  markExpect(built, base.expect);
  mark(built, "__waygraphSalt", "method");
  return built;
}
