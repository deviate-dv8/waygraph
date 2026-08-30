import type { Page } from "@playwright/test";
import type { MemPage, MemKey } from "./mem-page.js";
import type { Trait } from "./trait.js";
import { runVerify } from "./trait.js";

/**
 * A Checkpoint is identified solely by its string tag - a phantom marker with no
 * embedded data. Two Checkpoints with the same tag are the same state everywhere.
 */
export type Checkpoint<Tag extends string> = { readonly __state: Tag };

/**
 * Builds a Checkpoint - spells `__state` for you so no call site does it by hand.
 * @example resolve: () => checkpoint("LoggedIn")
 */
export function checkpoint<Tag extends string>(tag: Tag): Checkpoint<Tag> {
  return { __state: tag };
}

/**
 * The four-phase pipeline every Block runs. Most Blocks only need `act` + a
 * one-line `resolve` - add `observe` only once a Block genuinely branches, add
 * `verify` only once you want to confirm the reached state, not just classify it.
 */
export interface Instruction<
  In extends Checkpoint<string>,
  Out extends Checkpoint<string>,
  Observed = void,
> {
  /** Drives the browser only, this tab only. Never touches `context` - see `observe` for that. */
  act(page: Page, input: In, mem: MemPage): Promise<void>;
  /**
   * Optional. Gathers evidence for `resolve` to classify, runs assertions,
   * writes memory - the only phase allowed to look at the DOM before a
   * decision is made, or open a second tab via `page.context()`.
   */
  observe?(page: Page, mem: MemPage): Promise<Observed>;
  /**
   * Mandatory, pure. Its only parameter is the evidence `observe` handed it -
   * no `page`, no `mem` in scope, not by convention but because they're
   * missing from the signature. Reproducible from `observed` alone.
   */
  resolve(observed: Observed): Out | Promise<Out>;
  /**
   * Optional. Runs once, only after `resolve` has already decided `Out` -
   * confirms or fails loud, can never redirect what was decided. A function
   * form picks different checks per branch (a failed login shouldn't be
   * checked against "reached the dashboard"); see {@link Block.withVerify} and
   * {@link Block.modVerify} for changing this from outside the Block's own file.
   */
  verify?: Trait[] | ((out: Out) => Trait[]);
}

/**
 * A Block wraps one instruction. Its Observed type is an internal detail, erased here.
 * `next` is optional routing attached by `branch()` - unset on a plain or
 * `connect()`-composed Block, meaning "terminal after one step" (today's behavior,
 * unchanged). Returning the Block itself from `next` is a self-loop. `requires` is
 * MemKeys this Block's `act` reads from `mem` and needs already set - declaring it
 * lets `preflight()` catch a missing value before any browser action runs, instead
 * of failing loud deep inside `act` after several real steps already happened.
 *
 * `withVerify`/`modVerify`/`modVerifyAll` are optional - present (and discoverable
 * by typing `someBlock.`) on any Block built via `defineBlock()`, absent on a raw
 * object literal (which is still a perfectly valid Block, e.g. every test fixture
 * in this codebase). They delegate to the identically-named free functions - same
 * logic, chainable as methods for the common case, still callable as
 * `withVerify(block, ...)` for a block that doesn't have them attached.
 */
export interface Block<In extends Checkpoint<string>, Out extends Checkpoint<string>> {
  /** A short, stable label - shows up in every error this Block can produce ("trait X failed after Y"). */
  name: string;
  /** The act/observe/resolve/verify pipeline itself. See {@link Instruction}. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instruction: Instruction<In, Out, any>;
  /**
   * Routing attached by {@link branch}. Unset on a plain or `connect()`-composed
   * Block, meaning "terminal after one step". Returning the Block itself is a
   * self-loop - see `runGraph`'s `maxSteps` for the safety net that needs.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  next?(checkpoint: Out): Block<any, any> | null | undefined;
  /**
   * MemKeys this Block's `act` reads from `mem` and needs already set.
   * Declaring it lets {@link preflight} (built into `runGraph`) catch a missing
   * value before any browser action runs, instead of failing loud deep inside
   * `act`.
   * @example requires: [LoginCreds.key]
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requires?: readonly MemKey<any>[];
  /**
   * Replaces this Block's whole `verify` list - the only way to clear it to
   * empty (the "I only care that I navigated this far" case) or go from no
   * verify to some. For tweaking one existing check without restating the
   * rest, use {@link Block.modVerify} instead.
   * @example LoginBlock.withVerify([])              // navigation-only, no DOM confirmation
   * @example LoginBlock.withVerify([urlMatches(/dashboard/)])
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withVerify?(verify: Trait[] | ((out: Out) => Trait[])): Block<In, Out>;
  /**
   * Replaces one existing Trait in this Block's `verify` list, by its `name`
   * (recommended) or numeric index, leaving every other check untouched - the
   * v1/v2/legacy-app case, where one check needs a different selector but the
   * rest of the Block is identical. Throws loud if the name/index doesn't
   * exist - use {@link Block.withVerify} if there's nothing there yet to replace.
   * @example LoginBlock.modVerify("url-matches", urlMatches(/dashboard\.html/))
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modVerify?(nameOrIndex: string | number, newCheck: Trait["check"] | Trait): Block<In, Out>;
  /**
   * {@link Block.modVerify}, but for several named checks in one call - a v2
   * variant that differs in five ways from v1 shouldn't need five nested calls.
   * @example LoginBlock.modVerifyAll({ "url-matches": urlMatches(/v2/), "cart-badge": textEquals(".badge-v2", "1") })
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modVerifyAll?(patches: Record<string, Trait["check"] | Trait>): Block<In, Out>;
}

/**
 * A Block guaranteed to have `withVerify`/`modVerify`/`modVerifyAll` attached -
 * what `defineBlock()` and, since they're built on it, `withVerify()`/`modVerify()`/
 * `modVerifyAll()`/`branch()` all return. Lets `LoginBlock.withVerify(...)` be
 * called directly, no `!`/`?.` needed - the type says the method is there, not
 * "maybe". A plain `Block<In, Out>` (a raw object literal) doesn't get this;
 * `DefinedBlock` is still assignable anywhere a `Block` is expected.
 */
export type DefinedBlock<In extends Checkpoint<string>, Out extends Checkpoint<string>> = Omit<
  Block<In, Out>,
  "withVerify" | "modVerify" | "modVerifyAll"
> & {
  withVerify(verify: Trait[] | ((out: Out) => Trait[])): DefinedBlock<In, Out>;
  modVerify(nameOrIndex: string | number, newCheck: Trait["check"] | Trait): DefinedBlock<In, Out>;
  modVerifyAll(patches: Record<string, Trait["check"] | Trait>): DefinedBlock<In, Out>;
};

/**
 * Composes two Blocks into one, typechecked so this only compiles when A's output
 * tag equals B's input tag. The composed Block's act runs A's full instruction
 * (act -> observe? -> resolve) then hands the resulting Checkpoint into B's act;
 * its own observe/resolve are simply B's, since B is what decides the final Out.
 */
export function connect<
  A extends Checkpoint<string>,
  B extends Checkpoint<string>,
  C extends Checkpoint<string>,
>(a: Block<A, B>, b: Block<B, C>): Block<A, C> {
  const bObserve = b.instruction.observe;
  const bVerify = b.instruction.verify;
  const requires = [...(a.requires ?? []), ...(b.requires ?? [])];
  return {
    name: `${a.name} -> ${b.name}`,
    ...(requires.length > 0 ? { requires } : {}),
    instruction: {
      async act(page, input, mem) {
        await a.instruction.act(page, input, mem);
        const aObserved = a.instruction.observe
          ? await a.instruction.observe(page, mem)
          : undefined;
        const mid = await a.instruction.resolve(aObserved);
        await runVerify(a.instruction.verify, mid, page, mem, a.name);
        await b.instruction.act(page, mid, mem);
      },
      resolve: (observed) => b.instruction.resolve(observed),
      // Only attach optional fields when B actually has them - exactOptionalPropertyTypes
      // forbids assigning `undefined` to an optional property directly.
      ...(bObserve ? { observe: (page, mem) => bObserve(page, mem) } : {}),
      ...(bVerify ? { verify: bVerify } : {}),
    },
  };
}
