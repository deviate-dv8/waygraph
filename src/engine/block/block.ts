// A Block: one step on a page. Its instruction acts, observes, resolves to a Checkpoint and verifies it; the helpers
// below build, decorate and route Blocks.
import type { Page } from "@playwright/test";
import type { Checkpoint } from "../checkpoint/checkpoint.js";
import {
    MSG_FLOW_BLOCK_NOT_FOUND_BY_INDEX,
    MSG_FLOW_BLOCK_NOT_FOUND_BY_NAME,
    MSG_MODVERIFY_FUNCTION_FORM,
    MSG_MODVERIFY_NOT_FOUND_BY_INDEX,
    MSG_MODVERIFY_NOT_FOUND_BY_NAME,
    WaygraphError,
} from "../errors.js";
import type { MemKey } from "../mem/mem.js";
import { MemPage } from "../mem/mem.js";
import type { WaygraphSlidesOrFn } from "../stub/ring.js";
import type { StubLifecycleFn } from "../stub/stub.js";
import type { Trait } from "../trait/trait.js";
import type { ActionPage, WaygraphInstanceOption } from "./action-page.js";

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
   * Optional. Runs once, right before `act` starts - confirms the page is
   * still in the state this Block is about to assume, before touching it.
   * `verify` only ever confirms what a Block ITSELF just did; nothing
   * previously checked whether the page is STILL there by the time the
   * NEXT Block starts (a redirect, a popup, a session timeout between two
   * Blocks - the gap `verify` alone can't see, since it only ever runs
   * right after the PREVIOUS Block's own resolve, not right before THIS
   * one's act). A function form picks different checks per incoming `In`,
   * same as `verify` does per resolved `Out`.
   * @example precondition: [Trait.visible("#checkout-form")]
   */
  precondition?: Trait[] | ((input: In) => Trait[]);
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
  /**
   * The demo's narration before the step, written by `Block.stubBefore((ctx) => ...)` where a flow uses the Block (stubs
   * chained there add up). Not something to set in a Block's definition: Blocks carry no narration.
   */
  stubBefore?: StubLifecycleFn<Out>;
  /** After the step lands; written by `Block.stubAfter((ctx) => ...)`. */
  stubAfter?: StubLifecycleFn<Out>;
  /** When the step fails, before the failure panel; written by `Block.stubOnError((ctx) => ...)`. */
  stubOnError?: StubLifecycleFn<Out>;
  /**
   * Multi-step demo captions ("yap" slides) with Next between each -
   * not block lifecycle. Explains a long process; optional `selector` rings
   * while that slide is up. Flow fixtures may override via `slides`.
   * @example slides: [
   *   { caption: "Checkout is three screens", tag: "YAP" },
   *   { caption: "Overview confirms totals", selector: ".summary_info" },
   * ]
   */
  slides?: WaygraphSlidesOrFn<Out>;
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
  /**
   * A human-readable sentence describing what this Block actually tests or
   * does - "the outsider case: a user outside a request's audience is
   * denied its detail page," not a restatement of the code. Purely
   * additive, optional narration for a human watching a run (step-mode
   * tooling shows it before the Block runs) - never read by
   * `runGraph`/`connect`/anything that decides behavior. A Block with none
   * just shows its `name` instead.
   */
  description?: string;
  /** The act/observe/resolve/verify pipeline itself. See {@link Instruction}. */
  instruction: Instruction<In, Out, any>;
  /**
   * Routing attached by {@link branch}. Unset on a plain or `connect()`-composed
   * Block, meaning "terminal after one step". Returning the Block itself is a
   * self-loop - see `runGraph`'s `maxSteps` for the safety net that needs.
   */
  next?(checkpoint: Out): SomeBlock | null | undefined;
  /**
   * `branch()`'s routing table as plain, readable data - Checkpoint tag ->
   * target Block's `.name` (`null` for a terminal tag) - alongside {@link next}
   * itself, which stays the actual runtime dispatch. `next` is an opaque
   * closure a graph-introspection tool can't read; this is `next`'s own
   * routing decisions exposed as data instead, purely additive and never
   * consulted by `runGraph`/`connect` - it exists only for tools like
   * `Flow`'s inspection method (and, eventually, `toMermaid`) to walk without
   * executing anything. A route back to the Block itself (a self-loop) maps
   * to that same Block's own name, not `null`.
   */
  routes?: Readonly<Record<string, string | null>>;
  /**
   * MemKeys this Block's `act` reads from `mem` and needs already set.
   * Declaring it lets {@link preflight} (built into `runGraph`) catch a missing
   * value before any browser action runs, instead of failing loud deep inside
   * `act`.
   * @example requires: [LoginCreds.key]
   */
  requires?: readonly MemKey<unknown>[];
  /**
   * Demo pacing for this Block (the `{ pace }` step option).
   * Demo/step only - `runGraph` ignores. Prefer `fastForwardComposeBlock` for blitz.
   */
  demoPace?: import("../stub/pace.js").DemoPace;
  /**
   * Optional. When this Block's real choices depend on the live page
   * (which of several items to add to cart, which of several rows to
   * open) rather than being knowable ahead of time, this returns one
   * option per live choice - `waygraph auto` lists one menu row per
   * option (via `label`) instead of a single generic edge, and seeds
   * `mem.set(option.key, option.value)` before this Block's own `act()`
   * runs when a row is picked. Purely additive tooling data - `runGraph`/
   * `connect`/anything that decides behavior never consults it; a Block
   * without it behaves exactly as before.
   * @example instanceOptions: (page) => collectInventoryItems(page).then((items) => items.map((it) => ({ id: it.id, label: `Add "${it.name}" to cart`, key: SelectedItem.key, value: it })))
   */
  instanceOptions?(page: Page): Promise<readonly WaygraphInstanceOption[]>;
  /**
   * Replaces this Block's whole `verify` list - the only way to clear it to
   * empty (the "I only care that I navigated this far" case) or go from no
   * verify to some. For tweaking one existing check without restating the
   * rest, use {@link Block.modVerify} instead.
   * @example LoginBlock.withVerify([])              // navigation-only, no DOM confirmation
   * @example LoginBlock.withVerify([urlMatches(/dashboard/)])
   */
  withVerify?(verify: Trait[] | ((out: Out) => Trait[])): Block<In, Out>;
  /**
   * Replaces one existing Trait in this Block's `verify` list, by its `name`
   * (recommended) or numeric index, leaving every other check untouched - the
   * v1/v2/legacy-app case, where one check needs a different selector but the
   * rest of the Block is identical. Throws loud if the name/index doesn't
   * exist - use {@link Block.withVerify} if there's nothing there yet to replace.
   * @example LoginBlock.modVerify("url-matches", urlMatches(/dashboard\.html/))
   */
  modVerify?(nameOrIndex: string | number, newCheck: Trait["check"] | Trait): Block<In, Out>;
  /**
   * {@link Block.modVerify}, but for several named checks in one call - a v2
   * variant that differs in five ways from v1 shouldn't need five nested calls.
   * @example LoginBlock.modVerifyAll({ "url-matches": urlMatches(/v2/), "cart-badge": textEquals(".badge-v2", "1") })
   */
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
  /**
   * Demo narration before act - prefer `(ctx) => { ctx.ring(...); ctx.mem?.get(...) }`.
   * Chains after any existing stubBefore on this Block (library then call-site).
   * Overloads keep `ctx` typed when the author passes a lifecycle function
   * (a single union parameter would make the callback param `any`).
   */
  stubBefore(stub: import("../stub/stub.js").StubLifecycleFn<Out>): DefinedBlock<In, Out>;
  /** Demo narration after resolve. Prefer ctx callbacks over slot-map objects. */
  stubAfter(stub: import("../stub/stub.js").StubLifecycleFn<Out>): DefinedBlock<In, Out>;
  /** Demo narration when the step fails / expected-failure path. */
  stubOnError(stub: import("../stub/stub.js").StubLifecycleFn<Out>): DefinedBlock<In, Out>;
};

/**
 * Any Block, whatever its route. A Block takes its `In` Checkpoint as a callback argument, so it is contravariant in `In`
 * and no one Checkpoint type covers every Block: `any` is that "some Block", written once here.
 */
export type SomeBlock = Block<any, any>;
/** The Checkpoint a Block resolves to. */
type BlockOut<B> = B extends Block<infer _In, infer Out> ? Out : never;
/** Any {@link DefinedBlock} (see {@link SomeBlock}). */
export type SomeDefinedBlock = DefinedBlock<any, any>;

export function findBlockIndex(middle: readonly SomeBlock[], block: SomeBlock | string | number): number {
  if (typeof block === "number") {
    if (block < 0 || block >= middle.length) {
      throw new WaygraphError("WG_FLOW_BLOCK_NOT_FOUND", MSG_FLOW_BLOCK_NOT_FOUND_BY_INDEX(block, middle.length));
    }
    return block;
  }
  const blockName = typeof block === "string" ? block : block.name;
  const index = middle.findIndex((b) => b.name === blockName);
  if (index === -1) {
    throw new WaygraphError(
      "WG_FLOW_BLOCK_NOT_FOUND",
      MSG_FLOW_BLOCK_NOT_FOUND_BY_NAME(blockName, middle.map((b) => b.name).join(", ")),
    );
  }
  return index;
}


/**
 * Strips `withVerify`/`modVerify`/`modVerifyAll` off a Block, keeping everything
 * else - `name`, `instruction`, `next`, `requires`. Every function below that
 * returns a new Block calls this on its input first, then rebuilds through
 * `defineBlock`. Without it, a Block's attached methods close over the shape it
 * had *when they were attached* - call `.withVerify()` on a Block that
 * `branch()` added routing to afterward, and without this step the result would
 * silently drop that routing, since the stale closure never knew about it.
 */
export function stripMethods<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  block: Block<In, Out>,
): {
  name: string;
  description?: Block<In, Out>["description"];
  instruction: Block<In, Out>["instruction"];
  next?: Block<In, Out>["next"];
  requires?: Block<In, Out>["requires"];
  routes?: Block<In, Out>["routes"];
  instanceOptions?: Block<In, Out>["instanceOptions"];
} {
  return {
    name: block.name,
    instruction: block.instruction,
    ...(block.description ? { description: block.description } : {}),
    ...(block.next ? { next: block.next } : {}),
    ...(block.requires ? { requires: block.requires } : {}),
    ...(block.routes ? { routes: block.routes } : {}),
    ...(block.instanceOptions ? { instanceOptions: block.instanceOptions } : {}),
  };
}


/** Copy non-enumerable waygraph markers so decorate/withVerify keep map() kind checks. */
export function copyWaygraphRuntime(from: object, to: object): void {
  for (const key of [
    "__waygraphKind",
    "__waygraphSalt",
    "__waygraphNavUrl",
    "__waygraphNavClick",
    "__waygraphNavFrom",
    "__waygraphFrom",
    "__waygraphTo",
  ] as const) {
    const desc = Object.getOwnPropertyDescriptor(from, key);
    if (!desc) continue;
    // Re-define as configurable so later decorate chains can copy again
    // (factory markers are non-configurable on the original).
    Object.defineProperty(to, key, {
      value: desc.value,
      enumerable: false,
      writable: false,
      configurable: true,
    });
  }
  const ff = (from as { fastForward?: boolean }).fastForward;
  if (ff === true) {
    (to as { fastForward?: boolean }).fastForward = true;
  }
  const pace = (from as { demoPace?: unknown }).demoPace;
  if (pace !== undefined) {
    (to as { demoPace?: unknown }).demoPace = pace;
  }
}


/**
 * Builds a Block with `withVerify`/`modVerify`/`modVerifyAll` attached as
 * methods - `LoginBlock.withVerify([...])`, discoverable by typing
 * `LoginBlock.` in an editor, not just callable as `withVerify(LoginBlock, ...)`
 * if you already know it exists. A raw object literal is still a perfectly
 * valid Block (every test fixture in this codebase is one) - it just won't have
 * these attached. The methods are thin: they delegate to the identically-named
 * free functions, which remain the one place this logic actually lives.
 */
export function defineBlock<In extends Checkpoint<string>, Out extends Checkpoint<string>>(base: {
  name: string;
  description?: Block<In, Out>["description"];
  // Narrower than Instruction<In,Out,any>'s own act() - page is typed as
  // ActionPage here (the @deprecated-tagged navigation methods), not the
  // real Page. A real Page is still what's passed at runtime (Page is
  // assignable to ActionPage - same members, only the JSDoc tag differs -
  // so this satisfies Instruction.act's own wider signature structurally);
  // this only affects what an AUTHOR sees while writing act() by hand.
  instruction: Omit<Instruction<In, Out, any>, "act"> & {
    act(page: ActionPage, input: In, mem: MemPage): Promise<void>;
  };
  next?: Block<In, Out>["next"];
  requires?: Block<In, Out>["requires"];
  routes?: Block<In, Out>["routes"];
  instanceOptions?: Block<In, Out>["instanceOptions"];
}): DefinedBlock<In, Out> {
  const plain: Block<In, Out> = {
    name: base.name,
    instruction: base.instruction,
    ...(base.description ? { description: base.description } : {}),
    ...(base.next ? { next: base.next } : {}),
    ...(base.requires ? { requires: base.requires } : {}),
    ...(base.routes ? { routes: base.routes } : {}),
    ...(base.instanceOptions ? { instanceOptions: base.instanceOptions } : {}),
  };
  // Methods must close over `defined` (this object), not `plain` - factories
  // attach __waygraphKind/__waygraphSalt on the returned object after
  // defineBlock returns; decorate/withVerify need those markers.
  const defined: DefinedBlock<In, Out> = {
    ...plain,
    withVerify: (verify) => withVerify(defined, verify),
    modVerify: (nameOrIndex, newCheck) => modVerify(defined, nameOrIndex, newCheck),
    modVerifyAll: (patches) => modVerifyAll(defined, patches),
    stubBefore: (stub) => withStubPhase(defined, "stubBefore", stub),
    stubAfter: (stub) => withStubPhase(defined, "stubAfter", stub),
    stubOnError: (stub) => withStubPhase(defined, "stubOnError", stub),
  };
  return defined;
}


/**
 * Returns a new Block that runs exactly like `block` - same act/observe/resolve,
 * same routing - but with `verify` replaced. For giving one flow stricter (or
 * looser, or just different) confirmation on a Block it didn't author, without
 * that Block needing to have been written as a parameterized factory in
 * anticipation. Same move as `branch()`: decorate an existing Block, don't ask
 * every Block to pre-build its own override mechanism.
 *
 * Wrap the one Block you want to change, in place, where a flow uses it:
 * `map().gotoPage(NavLoginBlock).method(withVerify(AddToCartBlock, [...]))`.
 */
export function withVerify<B extends SomeBlock>(
  block: B,
  verify: Trait[] | ((out: BlockOut<B>) => Trait[]),
): B {
  const base = stripMethods(block);
  const next = defineBlock({ ...base, instruction: { ...base.instruction, verify } });
  copyWaygraphRuntime(block, next);
  return next as unknown as B;
}


type StubPhaseFn<Out extends Checkpoint<string>> = StubLifecycleFn<Out>;


/** Runs a prior stub into the same ctx, so stubs chained on one Block add up. */
async function applyStubIntoCtx<Out extends Checkpoint<string>>(
  raw: StubPhaseFn<Out> | undefined,
  ctx: import("../stub/stub.js").StubCtx<Out>,
): Promise<void> {
  if (raw !== undefined) await raw(ctx);
}


function withStubPhase<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  block: Block<In, Out>,
  phase: "stubBefore" | "stubAfter" | "stubOnError",
  stub: StubPhaseFn<Out>,
): DefinedBlock<In, Out> {
  const base = stripMethods(block);
  const instr = base.instruction as {
    stubBefore?: StubPhaseFn<Out>;
    stubAfter?: StubPhaseFn<Out>;
    stubOnError?: StubPhaseFn<Out>;
  };
  const prev = instr[phase];
  const chained: import("../stub/stub.js").StubLifecycleFn<Out> = async (ctx) => {
    await applyStubIntoCtx(prev, ctx);
    await applyStubIntoCtx(stub, ctx);
  };
  const next = defineBlock({
    ...base,
    instruction: { ...base.instruction, [phase]: chained },
  });
  copyWaygraphRuntime(block, next);
  return next;
}


/**
 * Replaces one Trait inside `block`'s verify list, leaving every other check
 * untouched - the v1/v2/legacy-variant case, where one check needs a different
 * selector or URL pattern but the rest of the Block is identical. Addressed by
 * the Trait's own `name` (recommended - inserting or reordering other checks
 * can't silently retarget it) or, if you genuinely know the position and don't
 * need that safety, a numeric index. Either way a bad address fails loud
 * immediately instead of quietly doing nothing. `newCheck` can be a bare
 * `check` function (keeps the existing name) or a full `Trait` (to rename too).
 * Only works on a flat `verify` array - a function-form `verify` (from
 * `verify: (out) => Trait[]`) has no fixed list to address into, so this
 * throws rather than guess; use `withVerify` to replace it wholesale instead.
 */
export function modVerify<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  block: Block<In, Out>,
  nameOrIndex: string | number,
  newCheck: Trait["check"] | Trait,
): DefinedBlock<In, Out> {
  const verify = block.instruction.verify;
  if (typeof verify === "function") {
    throw new WaygraphError("WG_MODVERIFY_FUNCTION_FORM", MSG_MODVERIFY_FUNCTION_FORM(block.name));
  }
  const traits = verify ?? [];
  const index = typeof nameOrIndex === "number" ? nameOrIndex : traits.findIndex((t) => t.name === nameOrIndex);
  const existing = traits[index];
  if (!existing) {
    throw new WaygraphError(
      "WG_MODVERIFY_NOT_FOUND",
      typeof nameOrIndex === "number"
        ? MSG_MODVERIFY_NOT_FOUND_BY_INDEX(block.name, nameOrIndex, traits.length)
        : MSG_MODVERIFY_NOT_FOUND_BY_NAME(block.name, nameOrIndex, traits.map((t) => t.name).join(", ")),
    );
  }
  const replacement: Trait =
    typeof newCheck === "function"
      ? { name: typeof nameOrIndex === "string" ? nameOrIndex : existing.name, check: newCheck }
      : newCheck;
  const updated = [...traits];
  updated[index] = replacement;
  return withVerify(block, updated) as DefinedBlock<In, Out>;
}


/**
 * `modVerify`, but for several named checks in one call - a v2 variant that
 * differs in five ways from v1 shouldn't need five nested `modVerify(modVerify(
 * modVerify(...)))` calls to track by eye. `patches` keys are plain strings (a
 * Trait's `name`, not a `MemKey` instance), so an ordinary object literal is
 * fine here - unlike `MemPage`, there's no identity-collision reason to need
 * `[name, check]` pairs. Applies each patch in turn via `modVerify`, so the
 * same fail-loud-on-unknown-name behavior holds for every entry.
 */
export function modVerifyAll<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  block: Block<In, Out>,
  patches: Record<string, Trait["check"] | Trait>,
): DefinedBlock<In, Out> {
  const seed = defineBlock(stripMethods(block));
  copyWaygraphRuntime(block, seed);
  return Object.entries(patches).reduce(
    (current, [name, newCheck]) => modVerify(current, name, newCheck),
    seed,
  );
}
