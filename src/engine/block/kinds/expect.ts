// An Expect Block: a named, reusable check of what a scenario expects - a Block that only reads and judges. It runs as
// one of a step's expectations (`expect: [...]` on a Block or a step), in parallel with the others, never changing
// the page or mem.
import { mark } from "../mark.js";
import type { Checkpoint } from "../../checkpoint/checkpoint.js";
import type { DefinedBlock } from "../block.js";
import type { Trait } from "../../trait/trait.js";
import type { MemKey } from "../../mem/mem.js";
import { defineMethodBlock } from "./method.js";

/** Options for `defineExpectBlock`: the Checkpoint it judges and the checks that must hold there. */
export interface ExpectBlockOptions<Out extends Checkpoint<string> = Checkpoint<string>> {
  name: string;
  /** What it expects, in the scenario's words ("the toast says the machine was archived"): the demo and UI show it. */
  description?: string;
  /** The Checkpoint it judges: its value (`Registry`). */
  checkpoint: Out;
  /** Waits for a heading with this accessible name before the checks: a page that renders late. */
  waitForHeading?: string;
  /** The checks. They only read the page: an expectation that clicks, types or navigates fails, naming the action. */
  verify: Trait[] | ((out: Out) => Trait[]);
  /** Mem keys its checks read (a mem-aware Trait): preflight checks them before the flow runs. */
  requires?: readonly MemKey<unknown>[];
}

/** A Block from {@link defineExpectBlock}: one expectation, used in `expect: [...]`. */
export type ExpectBlock<Out extends Checkpoint<string>> = Omit<
  DefinedBlock<Out, Out>,
  "withVerify" | "modVerify" | "modVerifyAll" | "stubBefore" | "stub" | "stubOnError"
> & {
  readonly __wgFactory?: "expect";
  withVerify(verify: Trait[] | ((out: Out) => Trait[])): ExpectBlock<Out>;
  modVerify(nameOrIndex: string | number, newCheck: Trait["check"] | Trait): ExpectBlock<Out>;
  modVerifyAll(patches: Record<string, Trait["check"] | Trait>): ExpectBlock<Out>;
  /** Demo narration around the expectation (the demo plays them after the step it belongs to). */
  stubBefore(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): ExpectBlock<Out>;
  stub(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): ExpectBlock<Out>;
  stubOnError(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): ExpectBlock<Out>;
};

/**
 * Declares what a scenario expects on a page, as a named Block: reusable, shown by the demo and the UI. It only reads:
 * it stays on `checkpoint`, and its checks may not click, type, navigate or set mem.
 * @example
 * export const ExpectArchivedToastBlock = defineExpectBlock({
 *   name: "expect-archived-toast",
 *   description: "The toast says the machine was archived.",
 *   checkpoint: Registry,
 *   verify: [Trait.text(RegistrySel.toast, "Equipment archived")],
 * });
 */
export function defineExpectBlock<Out extends Checkpoint<string>>(options: ExpectBlockOptions<Out>): ExpectBlock<Out> {
  const built = defineMethodBlock<Out, Out>({
    name: options.name,
    ...(options.description ? { description: options.description } : {}),
    ...(options.requires ? { requires: options.requires } : {}),
    from: options.checkpoint,
    to: options.checkpoint,
    instruction: {
      async act(page) {
        if (options.waitForHeading !== undefined) await page.getByRole("heading", { name: options.waitForHeading }).waitFor();
      },
      verify: options.verify,
    },
  });
  mark(built, "__waygraphKind", "expect");
  return built as unknown as ExpectBlock<Out>;
}

/** One thing a step expects: a check (a Trait, or `Key.is(...)` on a Read key, `Page.check(...)`), or an Expect Block. */
export type Expectation<Out extends Checkpoint<string>> = Trait | ExpectBlock<Out>;

/**
 * What a Block or a step expects after it runs: a list, or - for a Block that can land in several places - a list per
 * outcome, each typed to its own Checkpoint.
 * @example expect: [ExpectArchivedToastBlock, Machine.status.is("Archived")]
 * @example expect: { EquipmentDetail: [ExpectSavedToastBlock], EquipmentAdd: [ExpectNameRequiredBlock] }
 */
export type ExpectList<Out extends Checkpoint<string>> =
  | readonly Expectation<Out>[]
  | { readonly [K in Out["__state"]]?: readonly Expectation<Extract<Out, Checkpoint<K>>>[] };
