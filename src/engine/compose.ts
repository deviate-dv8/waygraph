// Split out of the former 2,900-line engine.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import type { BlockInfo } from "./flow.js";
import { connect } from "../types.js";
import type { Block, Checkpoint } from "../types.js";
import type { Trait } from "../trait.js";
import { findBlockIndex, modVerify, withVerify } from "./core.js";

/**
 * A Block guaranteed to have `withStepVerify`/`modStepVerify` attached - what
 * {@link composeBlock} returns. Extends plain `Block`, so it drops straight into
 * `defineFlow([start, ..., composed, ..., end])` like any other Block; no special
 * casing needed anywhere that only expects a `Block`.
 */
export interface ComposedBlock<In extends Checkpoint<string>, Out extends Checkpoint<string>>
  extends Block<In, Out> {
  /**
   * This composed Block's constituent steps, in order, as plain data - same
   * shape and purpose as {@link Flow.blocks}.
   * @example GovFormBlock.steps() // [{ name: "step-1-name" }, { name: "step-2-address" }, ...]
   */
  steps(): readonly BlockInfo[];
  /**
   * Replaces one step's whole verify list, wherever it sits in this composed
   * Block - same rules as {@link withVerify}. Throws if no step matches.
   * @example GovFormBlock.withStepVerify("step-2-address", [])
   */
  withStepVerify(
    step: Block<any, any> | string | number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    verify: Trait[] | ((out: any) => Trait[]),
  ): ComposedBlock<In, Out>;
  /**
   * Replaces one Trait inside one step's verify list - same rules as
   * {@link modVerify}. Throws if no step matches, or that step has no verify
   * trait at the given name/index.
   * @example GovFormBlock.modStepVerify("step-2-address", "zip-visible", Trait.visible("#zip-confirmed"))
   */
  modStepVerify(
    step: Block<any, any> | string | number,
    nameOrIndex: string | number,
    newCheck: Trait["check"] | Trait,
  ): ComposedBlock<In, Out>;
}


/**
 * Chains several Blocks into one named, exported unit - what a naturally
 * multi-step feature (a stepper form with several pages, say) wants instead of
 * either one giant Block with no per-step confirmation, or several separately
 * exported Blocks the caller has to wire together by hand every time. Each
 * step keeps its own real `act`/`resolve`/`verify`, chained the same way
 * `connect()` already chains any two Blocks - `composeBlock` is not a new
 * execution mechanism, just `connect()` reduced over the list plus a name and
 * the same step-list closure `Flow` already keeps for its own Block list, so
 * `withStepVerify`/`modStepVerify` can patch one step from outside without the
 * caller needing to hand-rebuild the chain. Resolution is by `.name`, not
 * object identity, so a step reference stays valid even after an earlier patch
 * swapped that slot for a new object - see {@link Flow.withBlockVerify} for
 * the identical guarantee one level up. Each call returns a new composed
 * Block; the original is untouched.
 * @example composeBlock("gov-form", [step1, step2, step3, step4])
 */
export function composeBlock<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  name: string,
  steps: readonly [Block<In, Out>],
): ComposedBlock<In, Out>;

export function composeBlock<
  In extends Checkpoint<string>,
  B extends Checkpoint<string>,
  Out extends Checkpoint<string>,
>(name: string, steps: readonly [Block<In, B>, Block<B, Out>]): ComposedBlock<In, Out>;

export function composeBlock<
  In extends Checkpoint<string>,
  B extends Checkpoint<string>,
  C extends Checkpoint<string>,
  Out extends Checkpoint<string>,
>(name: string, steps: readonly [Block<In, B>, Block<B, C>, Block<C, Out>]): ComposedBlock<In, Out>;

export function composeBlock<
  In extends Checkpoint<string>,
  B extends Checkpoint<string>,
  C extends Checkpoint<string>,
  D extends Checkpoint<string>,
  Out extends Checkpoint<string>,
>(
  name: string,
  steps: readonly [Block<In, B>, Block<B, C>, Block<C, D>, Block<D, Out>],
): ComposedBlock<In, Out>;

export function composeBlock<
  In extends Checkpoint<string>,
  B extends Checkpoint<string>,
  C extends Checkpoint<string>,
  D extends Checkpoint<string>,
  E extends Checkpoint<string>,
  Out extends Checkpoint<string>,
>(
  name: string,
  steps: readonly [Block<In, B>, Block<B, C>, Block<C, D>, Block<D, E>, Block<E, Out>],
): ComposedBlock<In, Out>;

export function composeBlock<
  In extends Checkpoint<string>,
  B extends Checkpoint<string>,
  C extends Checkpoint<string>,
  D extends Checkpoint<string>,
  E extends Checkpoint<string>,
  F extends Checkpoint<string>,
  Out extends Checkpoint<string>,
>(
  name: string,
  steps: readonly [Block<In, B>, Block<B, C>, Block<C, D>, Block<D, E>, Block<E, F>, Block<F, Out>],
): ComposedBlock<In, Out>;

export function composeBlock(
  name: string,
  steps: readonly Block<any, any>[],
): ComposedBlock<any, any> {
  if (steps.length === 0) {
    throw new Error(`composeBlock: "${name}" needs at least one step`);
  }
  const chain = steps.reduce((a, b) => connect(a, b));
  return {
    ...chain,
    name,
    steps: () => steps.map((b) => ({ name: b.name, block: b, ...(b.routes ? { routes: b.routes } : {}) })),
    withStepVerify(step, verify) {
      const index = findBlockIndex(steps, step);
      const patched = [...steps];
      patched[index] = withVerify(steps[index]!, verify);
      return composeBlock(name, patched as [Block<any, any>]);
    },
    modStepVerify(step, nameOrIndex, newCheck) {
      const index = findBlockIndex(steps, step);
      const patched = [...steps];
      patched[index] = modVerify(steps[index]!, nameOrIndex, newCheck);
      return composeBlock(name, patched as [Block<any, any>]);
    },
  };
}


/**
 * Same shape as {@link composeBlock}, marked {@link FastForwardComposedBlock.fastForward}
 * so demo/run/traverse treat it as **one opaque step** that **blitzes wall-clock**
 * (skip overlay theater + no Playwright slowMo on that step's acts) unless
 * `--ff-expand` / `WAYGRAPH_FF_EXPAND=1`. Inner acts still run for real;
 * failures are prefixed `ff-name > …` so the locus names both the FF unit and
 * the inner step. Prefer this for boring or heavy-check prefixes (auth, seed,
 * dashboard settle) — you may put **several** FF units in one Flow with normal
 * Blocks between them.
 * @example fastForwardComposeBlock("ff-owner-auth", [NavLoginBlock, SubmitLoginForFlow])
 */
export interface FastForwardComposedBlock<In extends Checkpoint<string>, Out extends Checkpoint<string>>
  extends ComposedBlock<In, Out> {
  readonly fastForward: true;
}


/** True when `block` came from {@link fastForwardComposeBlock}. */
export function isFastForwardBlock(
  block: Block<any, any>,
): block is FastForwardComposedBlock<any, any> {
  return (
    (block as FastForwardComposedBlock<any, any>).fastForward === true &&
    typeof (block as ComposedBlock<any, any>).steps === "function"
  );
}


function wrapFfError(ffName: string, err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.startsWith(`${ffName} > `)) {
    return err instanceof Error ? err : new Error(msg);
  }
  const wrapped = new Error(`${ffName} > ${msg}`);
  if (err instanceof Error && err.stack) {
    wrapped.stack = err.stack;
  }
  return wrapped;
}


export function fastForwardComposeBlock<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  name: string,
  steps: readonly [Block<In, Out>],
): FastForwardComposedBlock<In, Out>;

export function fastForwardComposeBlock<
  In extends Checkpoint<string>,
  B extends Checkpoint<string>,
  Out extends Checkpoint<string>,
>(name: string, steps: readonly [Block<In, B>, Block<B, Out>]): FastForwardComposedBlock<In, Out>;

export function fastForwardComposeBlock<
  In extends Checkpoint<string>,
  B extends Checkpoint<string>,
  C extends Checkpoint<string>,
  Out extends Checkpoint<string>,
>(
  name: string,
  steps: readonly [Block<In, B>, Block<B, C>, Block<C, Out>],
): FastForwardComposedBlock<In, Out>;

export function fastForwardComposeBlock<
  In extends Checkpoint<string>,
  B extends Checkpoint<string>,
  C extends Checkpoint<string>,
  D extends Checkpoint<string>,
  Out extends Checkpoint<string>,
>(
  name: string,
  steps: readonly [Block<In, B>, Block<B, C>, Block<C, D>, Block<D, Out>],
): FastForwardComposedBlock<In, Out>;

export function fastForwardComposeBlock<
  In extends Checkpoint<string>,
  B extends Checkpoint<string>,
  C extends Checkpoint<string>,
  D extends Checkpoint<string>,
  E extends Checkpoint<string>,
  Out extends Checkpoint<string>,
>(
  name: string,
  steps: readonly [Block<In, B>, Block<B, C>, Block<C, D>, Block<D, E>, Block<E, Out>],
): FastForwardComposedBlock<In, Out>;

export function fastForwardComposeBlock<
  In extends Checkpoint<string>,
  B extends Checkpoint<string>,
  C extends Checkpoint<string>,
  D extends Checkpoint<string>,
  E extends Checkpoint<string>,
  F extends Checkpoint<string>,
  Out extends Checkpoint<string>,
>(
  name: string,
  steps: readonly [Block<In, B>, Block<B, C>, Block<C, D>, Block<D, E>, Block<E, F>, Block<F, Out>],
): FastForwardComposedBlock<In, Out>;

export function fastForwardComposeBlock(
  name: string,
  steps: readonly Block<any, any>[],
): FastForwardComposedBlock<any, any> {
  if (steps.length === 0) {
    throw new Error(`fastForwardComposeBlock: "${name}" needs at least one step`);
  }
  const base = composeBlock(name, steps as [Block<any, any>]);
  const origAct = base.instruction.act.bind(base.instruction);
  const ff: FastForwardComposedBlock<any, any> = {
    ...base,
    fastForward: true,
    instruction: {
      ...base.instruction,
      async act(page, input, mem) {
        try {
          await origAct(page, input, mem);
        } catch (e) {
          throw wrapFfError(name, e);
        }
      },
    },
    withStepVerify(step, verify) {
      const index = findBlockIndex(steps, step);
      const patched = [...steps];
      patched[index] = withVerify(steps[index]!, verify);
      return fastForwardComposeBlock(name, patched as [Block<any, any>]);
    },
    modStepVerify(step, nameOrIndex, newCheck) {
      const index = findBlockIndex(steps, step);
      const patched = [...steps];
      patched[index] = modVerify(steps[index]!, nameOrIndex, newCheck);
      return fastForwardComposeBlock(name, patched as [Block<any, any>]);
    },
  };
  return ff;
}
