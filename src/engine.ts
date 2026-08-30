import { chromium, firefox, webkit } from "@playwright/test";
import type { Browser, BrowserContext } from "@playwright/test";
import type { Block, Checkpoint, Instruction, DefinedBlock } from "./types.js";
import { connect, checkpoint } from "./types.js";
import { MemPage } from "./mem-page.js";
import type { Trait } from "./trait.js";
import { runVerify } from "./trait.js";

const LAUNCHERS = { chromium, firefox, webkit };

/**
 * Checks `block.requires` against `mem` and throws, naming every missing key at
 * once, if any are unset. `connect()` unions each Block's `requires` into the
 * composed Block, so calling this on a `defineFlow`-built Flow's entry - which
 * `runGraph` does automatically, before opening a tab - covers every Block in
 * that flow. It does not see Blocks only reachable through `branch()` routing,
 * since those depend on a runtime decision that hasn't happened yet.
 */
export function preflight(mem: MemPage, block: Block<any, any>): void {
  const missing = (block.requires ?? []).filter((k) => !mem.has(k));
  if (missing.length > 0) {
    throw new Error(
      `preflight: MemPage is missing required key(s) before "${block.name}" can run: ${missing
        .map((k) => `"${k.name}"`)
        .join(", ")}`,
    );
  }
}

/**
 * Runs `entry` against a fresh tab and returns the resulting terminal Checkpoint.
 * The engine owns the tab's lifecycle, not any individual Block: the tab is
 * created before the first `act` runs and closed in `finally`, so it closes even
 * if a step throws.
 *
 * After each Block resolves, its `next` (if any, from `branch()`) is followed to
 * the following Block, in the same tab - a Block with no `next` runs exactly once,
 * unchanged from before `branch()` existed. `next` returning the same Block is a
 * self-loop; `maxSteps` bounds the loop so a routing bug fails loud instead of
 * hanging.
 *
 * `terminals`, if given, is a sanity check: the Checkpoint the run stops on must be
 * one of the tags the caller actually expects, or the run fails loud instead of
 * silently returning an unexpected result. Omit it when there is only ever one
 * reachable outcome by construction (as with a `defineFlow`-built Flow, which has
 * no routing at all) - there is nothing to validate against.
 */
export async function runGraph<TOut extends Checkpoint<string>>(
  entry: Block<Checkpoint<"__start__">, TOut>,
  terminals: ReadonlySet<string> | undefined,
  context: BrowserContext,
  mem: MemPage,
  maxSteps = 5000,
): Promise<TOut> {
  preflight(mem, entry);
  const page = await context.newPage();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: Block<any, any> = entry;
    let input: Checkpoint<string> = checkpoint("__start__");
    let steps = 0;

    for (;;) {
      if (++steps > maxSteps) {
        throw new Error(`runGraph: exceeded ${maxSteps} steps - check for an unintended self-loop`);
      }

      await current.instruction.act(page, input, mem);
      const observed = current.instruction.observe
        ? await current.instruction.observe(page, mem)
        : undefined;
      const checkpoint = await current.instruction.resolve(observed);

      await runVerify(current.instruction.verify, checkpoint, page, mem, current.name);

      const next = current.next?.(checkpoint);
      if (!next) {
        if (terminals && !terminals.has(checkpoint.__state)) {
          throw new Error(
            `runGraph: "${current.name}" resolved to "${checkpoint.__state}", which is not a registered terminal (expected one of: ${[...terminals].join(", ")})`,
          );
        }
        return checkpoint as TOut;
      }

      current = next;
      input = checkpoint;
    }
  } finally {
    await page.close();
  }
}

/** Reserved markers bookending a `defineFlow([start, ...blocks, end])` call. */
export const start = Symbol("waygraph.start");
export const end = Symbol("waygraph.end");
type StartMarker = typeof start;
type EndMarker = typeof end;

/**
 * A composed, runnable flow. Always begins from Checkpoint<"__start__">, same as
 * runGraph's `entry`. `run(context, mem)` uses a context you already have (the
 * usual case inside a `@playwright/test` file, via its `context` fixture) -
 * there's no browser for this Flow to launch, so no config to pass. `run(mem,
 * config?)` - no context - has the Engine launch and own its own browser for
 * this one run instead, and closes it in `finally`; use this outside a
 * Playwright test file, or when a flow genuinely needs its own browser instance
 * rather than sharing the test's. `config` here overrides, per key, whatever
 * `new Engine(...)` was constructed with - so one flow (module-level, imported
 * by many specs) can still have every run choose its own `headless`/`slowMo`
 * rather than being stuck with whatever the flow's own file happened to set.
 *
 * `withBlockVerify`/`modBlockVerify` do what {@link withVerify}/{@link modVerify}
 * do for a single Block, one level up - a spec that only imports the finished
 * Flow (not necessarily the individual Blocks it was built from) can still
 * patch one Block's verify for just that call, without editing the flow's own
 * file or hand-rebuilding its Block list. Addressed the same three ways
 * `modVerify` already addresses a Trait - the Block reference itself
 * (`LoginBlock`, imported like any other Block; typo-proof, refactor-safe,
 * jump-to-definition works), a plain string name, or a numeric index into this
 * Flow's Block list (position between `start`/`end`, 0-based) for a spec that
 * genuinely doesn't have the Block imported and doesn't want to spell its
 * name. A reference or string resolves by `.name` under the hood (a Block's
 * own stable identity in this codebase, same as every error message elsewhere
 * in this file already uses) rather than object identity - it stays
 * resolvable even after an earlier patch already swapped that slot for a new
 * object, since the name survives every `withVerify`/`modVerify` in the
 * chain; an index is checked fresh against this Flow's current Block list
 * each call, so it's still correct after a patch too. Returns a new Flow -
 * the original is untouched, same as every other decorator in this module.
 */
export interface Flow<Out extends Checkpoint<string>> {
  run(context: BrowserContext, mem: MemPage): Promise<Out>;
  run(mem: MemPage, config?: EngineConfig): Promise<Out>;
  /**
   * Replaces the given Block's whole verify list, wherever it sits in this
   * Flow - same rules as {@link withVerify}. Throws if no Block in this Flow
   * matches.
   * @example checkoutFlow.withBlockVerify(LoginBlock, [])
   * @example checkoutFlow.withBlockVerify("login", [])
   * @example checkoutFlow.withBlockVerify(0, [])
   */
  withBlockVerify(
    block: Block<any, any> | string | number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    verify: Trait[] | ((out: any) => Trait[]),
  ): Flow<Out>;
  /**
   * Replaces one Trait inside the given Block's verify list - same rules as
   * {@link modVerify}. Throws if no Block in this Flow matches, or if that
   * Block has no verify trait at the given name/index.
   * @example checkoutFlow.modBlockVerify(LoginBlock, "url-matches", Trait.url({ pathname: "/inventory.html" }))
   */
  modBlockVerify(
    block: Block<any, any> | string | number,
    nameOrIndex: string | number,
    newCheck: Trait["check"] | Trait,
  ): Flow<Out>;
}

function findBlockIndex(middle: readonly Block<any, any>[], block: Block<any, any> | string | number): number {
  if (typeof block === "number") {
    if (block < 0 || block >= middle.length) {
      throw new Error(`Flow: no Block at index ${block} in this flow (has ${middle.length})`);
    }
    return block;
  }
  const blockName = typeof block === "string" ? block : block.name;
  const index = middle.findIndex((b) => b.name === blockName);
  if (index === -1) {
    throw new Error(
      `Flow: no Block named "${blockName}" in this flow (has: ${middle.map((b) => b.name).join(", ")})`,
    );
  }
  return index;
}

function buildFlow<Out extends Checkpoint<string>>(
  middle: readonly Block<any, any>[],
  engineConfig: EngineConfig,
): Flow<Out> {
  const chain = middle.reduce((a, b) => connect(a, b)) as unknown as Block<
    Checkpoint<"__start__">,
    Out
  >;
  return {
    async run(
      contextOrMem: BrowserContext | MemPage,
      memOrConfig?: MemPage | EngineConfig,
    ): Promise<Out> {
      if (contextOrMem instanceof MemPage) {
        const mem = contextOrMem;
        const config: EngineConfig = { ...engineConfig, ...(memOrConfig as EngineConfig | undefined) };
        // Checked again inside runGraph too, but doing it here first means a
        // missing key fails before a browser process even launches, not just
        // before a page opens - the same "fail loud, cheaply" guarantee
        // run(context, mem) already has via an existing context.
        preflight(mem, chain);
        const launch = LAUNCHERS[config.browserName ?? "chromium"];
        const browser: Browser = await launch.launch({
          headless: config.headless ?? true,
          ...(config.slowMo !== undefined ? { slowMo: config.slowMo } : {}),
        });
        try {
          const context = await browser.newContext();
          return await runGraph<Out>(chain, undefined, context, mem);
        } finally {
          await browser.close();
        }
      }
      return runGraph<Out>(chain, undefined, contextOrMem, memOrConfig as MemPage);
    },
    withBlockVerify(block, verify) {
      const index = findBlockIndex(middle, block);
      const patched = [...middle];
      patched[index] = withVerify(middle[index]!, verify);
      return buildFlow<Out>(patched, engineConfig);
    },
    modBlockVerify(block, nameOrIndex, newCheck) {
      const index = findBlockIndex(middle, block);
      const patched = [...middle];
      patched[index] = modVerify(middle[index]!, nameOrIndex, newCheck);
      return buildFlow<Out>(patched, engineConfig);
    },
  };
}

/** Configures how an Engine launches its own browser - only used by `Flow.run(mem)` (no context given); ignored by `Flow.run(context, mem)`, since that context is already launched. */
export interface EngineConfig {
  /** Default `true`, matching Playwright's own default. */
  headless?: boolean;
  /** Default `"chromium"`. */
  browserName?: "chromium" | "firefox" | "webkit";
  /** Milliseconds Playwright pauses before each operation - for watching a non-headless run with your own eyes, not for real runs. Default `0`. */
  slowMo?: number;
}

type S = Checkpoint<"__start__">;

/**
 * Holds engine-level configuration shared across every flow defined from it -
 * for now, just how to launch a browser when a Flow owns its own
 * (`headless`/`browserName`/`slowMo`); traits/interstitials/watchers land here
 * in a later change.
 * @example const engine = new Engine({ headless: false, slowMo: 250 });
 */
export class Engine {
  constructor(private readonly config: EngineConfig = {}) {}

  /**
   * Builds a runnable {@link Flow} from `[start, ...Blocks, end]`, typechecked
   * so each Block's `In` must match the previous Block's `Out` - the same
   * check `connect()` does, just declared as a flat array instead of hand-nested
   * calls. Overloaded for 2-7 array slots (1-6 real Blocks between `start`/`end`)
   * rather than one fully-generic recursive tuple type, so each arity is as
   * reliably checked as `connect<A,B,C>` itself.
   * @example engine.defineFlow([start, LoginBlock, AddToCartBlock, end])
   */
  defineFlow<B extends Checkpoint<string>>(blocks: readonly [StartMarker, Block<S, B>, EndMarker]): Flow<B>;
  defineFlow<B extends Checkpoint<string>, C extends Checkpoint<string>>(
    blocks: readonly [StartMarker, Block<S, B>, Block<B, C>, EndMarker],
  ): Flow<C>;
  defineFlow<B extends Checkpoint<string>, C extends Checkpoint<string>, D extends Checkpoint<string>>(
    blocks: readonly [StartMarker, Block<S, B>, Block<B, C>, Block<C, D>, EndMarker],
  ): Flow<D>;
  defineFlow<
    B extends Checkpoint<string>,
    C extends Checkpoint<string>,
    D extends Checkpoint<string>,
    E extends Checkpoint<string>,
  >(
    blocks: readonly [StartMarker, Block<S, B>, Block<B, C>, Block<C, D>, Block<D, E>, EndMarker],
  ): Flow<E>;
  defineFlow<
    B extends Checkpoint<string>,
    C extends Checkpoint<string>,
    D extends Checkpoint<string>,
    E extends Checkpoint<string>,
    F extends Checkpoint<string>,
  >(
    blocks: readonly [
      StartMarker,
      Block<S, B>,
      Block<B, C>,
      Block<C, D>,
      Block<D, E>,
      Block<E, F>,
      EndMarker,
    ],
  ): Flow<F>;
  defineFlow<
    B extends Checkpoint<string>,
    C extends Checkpoint<string>,
    D extends Checkpoint<string>,
    E extends Checkpoint<string>,
    F extends Checkpoint<string>,
    G extends Checkpoint<string>,
  >(
    blocks: readonly [
      StartMarker,
      Block<S, B>,
      Block<B, C>,
      Block<C, D>,
      Block<D, E>,
      Block<E, F>,
      Block<F, G>,
      EndMarker,
    ],
  ): Flow<G>;
  defineFlow(blocks: readonly [StartMarker, ...Block<any, any>[], EndMarker]): Flow<any> {
    return buildFlow(blocks.slice(1, -1) as Block<any, any>[], this.config);
  }
}

/**
 * Attaches routing to `block` without touching its act/observe/resolve/verify -
 * `routes` must cover every tag of `block`'s output (a missing route is a compile
 * error), and the returned Block runs exactly as `block` always did, just followed
 * by whichever next Block the resolved tag routes to. `null` for a tag means that
 * tag is terminal - the run stops there, same as a Block with no routing at all.
 * A route pointing back at `block` itself is a self-loop; see `runGraph`'s
 * `maxSteps` for its safety net. The return type is deliberately `Block<In, any>` -
 * a route can lead anywhere, including back through itself, so there is no fixed
 * Out type to express; state the expected outcomes to `runGraph` via `terminals`
 * instead.
 */
export function branch<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  block: Block<In, Out>,
  routes: { [K in Out["__state"]]: Block<Extract<Out, Checkpoint<K>>, any> | null },
): DefinedBlock<In, any> {
  const base = stripMethods(block);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let routed!: DefinedBlock<In, any>;
  routed = defineBlock({
    ...base,
    next: (checkpoint: Out) => {
      const target = (routes as Record<string, Block<any, any> | null>)[checkpoint.__state];
      if (target === undefined || target === null) return undefined;
      // A route naming `block` itself (the only self-reference in scope when
      // `routes` was written) means "loop back with routing intact" - substitute
      // the routed Block, not the original with no `next` of its own.
      return target === block ? routed : target;
    },
  });
  return routed;
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripMethods<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  block: Block<In, Out>,
): { name: string; instruction: Block<In, Out>["instruction"]; next?: Block<In, Out>["next"]; requires?: Block<In, Out>["requires"] } {
  return {
    name: block.name,
    instruction: block.instruction,
    ...(block.next ? { next: block.next } : {}),
    ...(block.requires ? { requires: block.requires } : {}),
  };
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
  instruction: Instruction<In, Out, any>;
  next?: Block<In, Out>["next"];
  requires?: Block<In, Out>["requires"];
}): DefinedBlock<In, Out> {
  const plain: Block<In, Out> = {
    name: base.name,
    instruction: base.instruction,
    ...(base.next ? { next: base.next } : {}),
    ...(base.requires ? { requires: base.requires } : {}),
  };
  return {
    ...plain,
    withVerify: (verify) => withVerify(plain, verify),
    modVerify: (nameOrIndex, newCheck) => modVerify(plain, nameOrIndex, newCheck),
    modVerifyAll: (patches) => modVerifyAll(plain, patches),
  };
}

/**
 * Returns a new Block that runs exactly like `block` - same act/observe/resolve,
 * same routing - but with `verify` replaced. For giving one flow stricter (or
 * looser, or just different) confirmation on a Block it didn't author, without
 * that Block needing to have been written as a parameterized factory in
 * anticipation. Same move as `branch()`: decorate an existing Block, don't ask
 * every Block to pre-build its own override mechanism.
 *
 * Wrap the one Block you want to change, in place, wherever it already sits in
 * a `defineFlow([...])` array - every other Block stays untouched:
 * `defineFlow([start, LoginBlock, withVerify(AddToCartBlock, [...]), end])`.
 * There is no separate positional array to keep in sync and no `null`
 * placeholder for "skip this one" - `defineFlow` has no per-slot verify
 * argument at all, only whatever `verify` each Block's own `instruction` (or
 * a `withVerify(...)` wrapping it) carries with it.
 */
export function withVerify<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  block: Block<In, Out>,
  verify: Trait[] | ((out: Out) => Trait[]),
): DefinedBlock<In, Out> {
  const base = stripMethods(block);
  return defineBlock({ ...base, instruction: { ...base.instruction, verify } });
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
    throw new Error(
      `modVerify: "${block.name}" has a function-form verify, which has no fixed list to address into - use withVerify to replace it wholesale instead`,
    );
  }
  const traits = verify ?? [];
  const index = typeof nameOrIndex === "number" ? nameOrIndex : traits.findIndex((t) => t.name === nameOrIndex);
  const existing = traits[index];
  if (!existing) {
    throw new Error(
      typeof nameOrIndex === "number"
        ? `modVerify: "${block.name}" has no verify trait at index ${nameOrIndex} (has ${traits.length})`
        : `modVerify: "${block.name}" has no verify trait named "${nameOrIndex}" (has: ${
            traits.map((t) => t.name).join(", ") || "none"
          })`,
    );
  }
  const replacement: Trait =
    typeof newCheck === "function"
      ? { name: typeof nameOrIndex === "string" ? nameOrIndex : existing.name, check: newCheck }
      : newCheck;
  const updated = [...traits];
  updated[index] = replacement;
  return withVerify(block, updated);
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
  return Object.entries(patches).reduce(
    (current, [name, newCheck]) => modVerify(current, name, newCheck),
    defineBlock(stripMethods(block)),
  );
}
