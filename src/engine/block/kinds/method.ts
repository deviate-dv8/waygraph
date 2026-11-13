// A Method: a page action that doesn't navigate (fill, submit, toggle), from one Checkpoint to another.
import { markStates, type StateSets } from "../../mem/state.js";
import { mark } from "../mark.js";
import type { Checkpoint } from "../../checkpoint/checkpoint.js";
import type { DefinedBlock } from "../block.js";
import type { Trait } from "../../trait/trait.js";
import { defineBlock } from "../block.js";
import { markRouteOf, routed } from "../../checkpoint/route.js";
import { markExpect } from "../../run/expect.js";
import type { RoutedBlockBase } from "../../checkpoint/route.js";
import type { Account } from "../../flow/account.js";
import type { Page } from "@playwright/test";
import type { MemPage } from "../../mem/mem.js";
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
  "withVerify" | "modVerify" | "modVerifyAll" | "stubBefore" | "stub" | "stubOnError"
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
  stub(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): MethodBlock<In, Out>;
  stubOnError(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): MethodBlock<In, Out>;
};


/** What every Method has: its route, name and who has it. */
type MethodBase<In extends Checkpoint<string>, Out extends Checkpoint<string>> = Omit<RoutedBlockBase<In, Out>, "instruction"> & {
  /** The accounts that have it (its button shows for them); without it, every account. */
  for?: readonly Account[];
  /** The states (boolean mem keys declared with `state()`) it changes when it lands: `sets: [[Auth.signedIn, false]]`, or by where it landed. */
  sets?: StateSets;
};

/** A Method written flat: what it does, what must be true before, what it proves after, and where it lands. */
interface FlatMethod<In extends Checkpoint<string>, Out extends Checkpoint<string>> {
  /** Does the one thing: fill, click, submit. This tab only. */
  act(page: Page, input: In, mem: MemPage): Promise<void>;
  /** Checks before `act` that the page is where this Method assumes. */
  precondition?: Trait[] | ((input: In) => Trait[]);
  /** Proves, after it landed, that it took effect. */
  verify?: Trait[] | ((out: Out) => Trait[]);
  /** Where it landed, for a Method with more than one `to`: look at the page and say which (the others need no `lands`). */
  lands?(page: Page, mem: MemPage): Out | Promise<Out>;
  instruction?: never;
}

/** The nested form, deprecated: `instruction: { act, verify, ... }`. */
interface NestedMethod<In extends Checkpoint<string>, Out extends Checkpoint<string>> {
  /** @deprecated Write `act`, `verify`, `precondition` and `lands` on the Method itself. `waygraph upgrade --codemod instructions` converts a project. */
  instruction: RoutedBlockBase<In, Out>["instruction"];
  act?: never;
  precondition?: never;
  verify?: never;
  lands?: never;
}

/** A Method's options: its route, what it does and proves, and who has it. */
export type MethodBlockOptions<In extends Checkpoint<string>, Out extends Checkpoint<string>> = MethodBase<In, Out> & (FlatMethod<In, Out> | NestedMethod<In, Out>);

/** Builds a Block for one page action (fill, submit, click) that does not navigate. */
export function defineMethodBlock<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  options: MethodBlockOptions<In, Out>,
): MethodBlock<In, Out> {
  const { for: given, sets, act, precondition, verify, lands, instruction, ...base } = options as unknown as MethodBase<In, Out> & Partial<Omit<FlatMethod<In, Out>, "instruction">> & { instruction?: RoutedBlockBase<In, Out>["instruction"] };
  const nested = instruction ?? {
    act: act as FlatMethod<In, Out>["act"],
    ...(precondition ? { precondition } : {}),
    ...(verify ? { verify } : {}),
    ...(lands ? { observe: async (page: Page, mem: MemPage) => lands(page, mem), resolve: (landed: Out) => landed } : {}),
  };
  const built = defineBlock(routed({ ...base, instruction: nested } as RoutedBlockBase<In, Out>)) as MethodBlock<In, Out>;
  markRouteOf(built, base);
  markFor(built, given);
  markStates(built, { sets });
  markExpect(built, base.expect);
  mark(built, "__waygraphSalt", "method");
  return built;
}
