// A Method: a page action that doesn't navigate (fill, submit, toggle), from one Checkpoint to another.
import { mark } from "../mark.js";
import type { Checkpoint } from "../../checkpoint/checkpoint.js";
import type { DefinedBlock } from "../block.js";
import type { Trait } from "../../trait/trait.js";
import { defineBlock } from "../block.js";
import { markRouteOf, routed } from "../../checkpoint/route.js";
import { markExpect } from "../../run/expect.js";
import type { RoutedBlockBase } from "../../checkpoint/route.js";
import type { Account } from "../../flow/account.js";
import { markFor } from "../access.js";

/**
 * TypeScript salt over {@link defineBlock} for one-shot non-nav app steps
 * (submit, upload, finish, logout) - **methods** on a page. Same runtime Block;
 * marks `__waygraphSalt = "method"` so auto/docs can tell Method from bare
 * {@link defineBlock}. A Method on one row of many (add this item, remove that
 * one) names the row in mem (`requires`) and lists the rows on the page
 * (`instanceOptions`), so `waygraph auto` offers one menu row each. Prefer
 * hanging methods off a {@link definePageBlock} hub.
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


/** A Method's options: its route and instruction, and who has it. */
export type MethodBlockOptions<In extends Checkpoint<string>, Out extends Checkpoint<string>> = RoutedBlockBase<In, Out> & {
  /** The accounts that have it (its button shows for them); without it, every account. */
  for?: readonly Account[];
};

/** Builds a Block for one page action (fill, submit, click) that does not navigate. */
export function defineMethodBlock<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  options: MethodBlockOptions<In, Out>,
): MethodBlock<In, Out> {
  const { for: given, ...base } = options;
  const built = defineBlock(routed(base)) as MethodBlock<In, Out>;
  markRouteOf(built, base);
  markFor(built, given);
  markExpect(built, base.expect);
  mark(built, "__waygraphSalt", "method");
  return built;
}
