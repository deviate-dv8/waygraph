import type { Page } from "@playwright/test";
import type { MemPage, MemKey } from "./mem-page.js";
import type { Trait } from "./trait.js";
import { runVerify, runPrecondition } from "./trait.js";
import type {
  HighlightStubPhaseOrFn,
  WaygraphHighlight,
  WaygraphSlidesOrFn,
} from "./highlights.js";

export type {
  WaygraphHighlight,
  WaygraphHighlightStub,
  WaygraphHighlightFixture,
  WaygraphSlide,
  HighlightStubPhase,
  HighlightStubPhaseOrFn,
  HighlightFixtureMap,
  ResolvedHighlight,
  StubCtx,
  StubLifecycleFn,
  StubPhaseResult,
  StubPhaseFixtures,
  WaygraphTodoItem,
  WaygraphTodoInput,
} from "./highlights.js";

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
 * The type every entry Block's `In` must be - `runGraph` always seeds a fresh
 * run with `checkpoint("__start__")` as the fake initial input, so a Block
 * meant to lead off a Flow needs exactly this type. Exported so no project
 * has to know or hand-type the `"__start__"` literal itself - the same reason
 * `checkpoint()` exists instead of every call site spelling `{ __state: tag }`
 * by hand.
 * @example export const LoginBlock: Block<Start, LoggedIn> = { ... }
 */
export type Start = Checkpoint<"__start__">;

/**
 * The `page` a regular Block's `act()` is typed against via `defineBlock` -
 * structurally identical to Playwright's own `Page` (the same real object is
 * passed at runtime; this is a type-only narrowing), except `goto`, `reload`,
 * `goBack`, and `goForward` are re-declared under `@deprecated`. Nothing is
 * blocked - every method is still fully present and callable, and this never
 * causes a build to fail - but a TypeScript-aware editor shows the call
 * struck through with a hover warning the instant it's typed, pointing at
 * `defineNavBlock` instead. `NavBlock`'s own generated `act()` (the one place
 * navigation actually belongs) uses the real `Page`, not this type - that
 * distinction lives entirely inside `defineNavBlock` and never reaches a
 * NavBlock's own author, who never writes its `act()` by hand.
 */
export type ActionPage = Omit<Page, "goto" | "reload" | "goBack" | "goForward"> & {
  /** @deprecated Navigation doesn't belong in a regular Block's act() - use defineNavBlock instead. */
  goto: Page["goto"];
  /** @deprecated Navigation doesn't belong in a regular Block's act() - use defineNavBlock instead. */
  reload: Page["reload"];
  /** @deprecated Navigation doesn't belong in a regular Block's act() - use defineNavBlock instead. */
  goBack: Page["goBack"];
  /** @deprecated Navigation doesn't belong in a regular Block's act() - use defineNavBlock instead. */
  goForward: Page["goForward"];
};

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
   * Open block lifecycle **before / during** `act` (demo rings + fixtures).
   * Prefer `stubBefore(ctx) { ctx.todos(...); ctx.ring(...) }` — not a closed
   * slot object. Object map `{ email: { selector, label } }` remains a shorthand.
   * Flow {@link HighlightFixtureMap} still overrides ring labels.
   * @example stubBefore: (ctx) => {
   *   ctx.todos(["Email", "Password", "Submit"]);
   *   ctx.todoIndex(0);
   *   ctx.highlights({ email: { selector: "#email", label: "Email" } });
   * }
   */
  stubBefore?: HighlightStubPhaseOrFn<Out>;
  /**
   * Open block lifecycle **after** resolve (step panel rings + fixtures).
   * Prefer `stubAfter(ctx) { ... }`. Object map shorthand still works.
   * Prefer this over legacy {@link Instruction.highlights}.
   * @example stubAfter: (ctx) => {
   *   ctx.todoIndex(2);
   *   ctx.ring("badge", { selector: ".cart", label: "Cart updated" });
   * }
   */
  stubAfter?: HighlightStubPhaseOrFn<Out>;
  /**
   * Open block lifecycle when a **step throws** (failed verify / act error) -
   * before the error panel. Success-only {@link Instruction.stubAfter} never runs
   * here. Prefer `stubOnError(ctx) { ... }`.
   * @example stubOnError: (ctx) => {
   *   ctx.ring("card", { selector: ".alt-1", label: "Card at failure", tag: "BUG" });
   * }
   */
  stubOnError?: HighlightStubPhaseOrFn<Out>;
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
  /**
   * @deprecated Prefer {@link Instruction.stubAfter}. Shimmed to stubAfter keys
   * `"0"`, `"1"`, … when stubAfter is empty.
   */
  highlights?: readonly WaygraphHighlight[] | ((out: Out) => readonly WaygraphHighlight[]);
}

/**
 * One selectable option for a Block whose real choices depend on the live
 * page - "which of these items to add to cart" is only knowable by looking
 * at the DOM, not from static analysis. `waygraph auto` calls
 * {@link Block.instanceOptions} while building its menu and lists one row
 * per option (via `label`) instead of a single generic "block -> checkpoint"
 * row; picking a row does `mem.set(key, value)` before that Block's own
 * `act()` runs, so `act()` just reads mem exactly like any other required
 * key - it never needs to know whether it was driven by a human-authored
 * Flow or a dynamic auto-explore menu.
 * @example { id: "sauce-labs-backpack", label: 'Add "Sauce Labs Backpack" to cart', key: SelectedItem.key, value: { id: "sauce-labs-backpack", name: "Sauce Labs Backpack" } }
 */
export interface WaygraphInstanceOption<T = unknown> {
  /** Stable id for this option - used to dedupe menu rows across rebuilds. */
  id: string;
  /** Shown in the menu instead of a generic "block -> checkpoint" line. */
  label: string;
  /** Must be one of this Block's own `requires` keys. */
  key: MemKey<T>;
  /** `mem.set(key, value)` right before this Block's `act()` runs. */
  value: T;
  /**
   * Optional CSS selector for the element this option will act on.
   * `waygraph auto` (headful) rings that element while the menu row is hovered
   * so you can see what a pick would click before committing.
   */
  highlight?: string;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requires?: readonly MemKey<any>[];
  /**
   * Demo pacing for this Block or compose group (`withBlockPace`).
   * Demo/step only - `runGraph` ignores. Prefer `fastForwardComposeBlock` for blitz.
   */
  demoPace?: import("./highlights.js").DemoPace;
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
 * Structural (not imported) twin of `engine.ts`'s `Layout` - `types.ts` sits
 * below `engine.ts` in the module graph, so it can't import `Layout` without
 * a cycle. Same shape, matched by TypeScript's structural typing: any real
 * `Layout` satisfies this with no cast needed at the `connect()` call site.
 */
export interface ConnectLayout {
  name: string;
  appliesTo: (tag: string) => boolean;
  verify: Trait[] | ((out: any) => Trait[]);
}

/**
 * Composes two Blocks into one, typechecked so this only compiles when A's output
 * tag equals B's input tag. The composed Block's act runs A's full instruction
 * (act -> observe? -> resolve) then hands the resulting Checkpoint into B's act;
 * its own observe/resolve are simply B's, since B is what decides the final Out.
 *
 * `layouts`, if given, also runs against the intermediate Checkpoint (A's
 * resolved output, right before B's act) - the same enforcement `runGraph`'s
 * own loop already applies to a chain's FINAL Checkpoint, but a
 * `defineFlow`-built Flow never reaches that loop per-hop: `buildFlow`
 * reduces the whole Block array into one `connect()`-composed super-Block, so
 * every intermediate hop's verify (and now layout) has to run HERE, inside
 * this recursive `act`, not in `runGraph`'s loop, which only ever sees the
 * one composed Block run start to finish.
 */
export function connect<
  A extends Checkpoint<string>,
  B extends Checkpoint<string>,
  C extends Checkpoint<string>,
>(a: Block<A, B>, b: Block<B, C>, layouts?: readonly ConnectLayout[]): Block<A, C> {
  const bObserve = b.instruction.observe;
  const bVerify = b.instruction.verify;
  const requires = [...(a.requires ?? []), ...(b.requires ?? [])];
  return {
    name: `${a.name} -> ${b.name}`,
    ...(requires.length > 0 ? { requires } : {}),
    instruction: {
      async act(page, input, mem) {
        await runPrecondition(a.instruction.precondition, input, page, mem, a.name);
        await a.instruction.act(page, input, mem);
        const aObserved = a.instruction.observe
          ? await a.instruction.observe(page, mem)
          : undefined;
        const mid = await a.instruction.resolve(aObserved);
        await runVerify(a.instruction.verify, mid, page, mem, a.name);
        if (layouts) {
          for (const layout of layouts) {
            if (!layout.appliesTo(mid.__state)) continue;
            await runVerify(layout.verify, mid, page, mem, `${a.name} (layout: "${layout.name}")`);
          }
        }
        await runPrecondition(b.instruction.precondition, mid, page, mem, b.name);
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
