// A Flow: Blocks joined in order (connect), run as one with `run()`; map() builds them, with its settings (withSettings).
import { joinSteps } from "../run/connect.js";
import { launchOwnContext } from "../run/launch.js";
import type { Block } from "../block/block.js";
import type { Checkpoint } from "../checkpoint/checkpoint.js";
import { preflight, runSteps } from "../run/run.js";
import type { RunGraphOptions } from "../run/run.js";
import type { EngineConfig } from "../config.js";
import type { BrowserContext, Page } from "@playwright/test";
import { MemPage, type MemKey } from "../mem/mem.js";
import type { Trait } from "../trait/trait.js";
import { findBlock, modVerify, withVerify } from "../block/block.js";
import { normalizeHighlightSize, normalizeHighlightTone, normalizeHighlightWeight } from "../stub/ring.js";
import type { DemoPace } from "../stub/pace.js";
import type { HighlightStyleDefaults } from "../stub/ring.js";
import { ignorePageGone } from "../page-gone.js";
import type { SomeBlock } from "../block/some-block.js";

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
/**
 * One Block's identity as exposed by graph introspection - {@link Flow.blocks},
 * {@link ComposedBlock.steps} - without needing to execute anything. Does not
 * include the Block's literal Checkpoint `In`/`Out` tags: those are TypeScript
 * literal types, erased at runtime, and can only be recovered by a build-time
 * static-analysis tool reading the source's own type annotations - see the
 * `graph-visualization` openspec change for that piece.
 */
export interface BlockInfo {
  name: string;
  /** `branch()`'s routing table, if this Block has one - see {@link Block.routes}. */
  routes?: Readonly<Record<string, string | null>>;
  /**
   * True when a session-reset boundary runs immediately before this Block: the first Block of a sub-flow nested with
   * `.flow(sub, { reset: true })` (or a CLI chain segment whose flow has `sessionReset`). Absent on an ordinary Flow.
   */
  resetSessionBefore?: boolean;
  /** A cleanup step (`.finally(Block)`): it runs after the flow's steps, whether they passed or failed. */
  cleanup?: true;
  /**
   * The actual Block, re-runnable on its own - e.g. step-through tooling that runs a Flow's Blocks one at a time.
   * Introspection that only wants to read the shape (a visualizer) can ignore this and use `name`/`routes` alone.
   */
  block: SomeBlock;
}


/** A runnable chain of Blocks built by `engine.map()`. `run(mem)` launches its own browser; `run(context, mem)` reuses one. */
export interface Flow<Out extends Checkpoint<string>> {
  /**
   * `map({ sessionReset: true })`: this Flow wants a fresh browser session when it runs after another one (nested with
   * `.flow(sub)` or chained on the CLI). `run()` itself never reads it.
   */
  readonly resetSession: boolean;
  /** The engine config the Flow was built with (launcher, layouts); running one of its steps on its own uses it too. */
  readonly config: EngineConfig;
  /**
   * `map({ expectedFailure })` - a display hint for a step-through overlay: this Flow is DESIGNED to throw
   * (e.g. a blocked user's login attempt genuinely failing), not a bug in
   * the demo itself. `run()` never reads this - the Flow still throws
   * exactly as it would otherwise; only the overlay's error panel reads it,
   * to show an informational "this is the point" panel instead of an
   * alarming one indistinguishable from a real break.
   */
  readonly expectedFailureReason?: string;
  /**
   * Demo pacing for this Flow's episode (`map({ demoPace })`).
   * `run()` ignores; step/demo applies per Block in the episode.
   */
  readonly demoPace?: import("../stub/pace.js").DemoPace;
  /**
   * Default highlight size/weight/tone for this Flow's episode (`map({ highlightStyle })`).
   * Per-slot stub/fixture values win. `run()` ignores.
   */
  readonly highlightStyle?: import("../stub/ring.js").HighlightStyleDefaults;
  /**
   * `map({ memStub: true })` - opts into
   * auto-filling `requires` keys with registered fake values
   * (`registerMemStub`, `src/engine/mem/mem-stub.ts`) instead of failing preflight when
   * the caller didn't supply them. `run()` never reads this - the CLI's own
   * `--data`/`--mem-stub` seeding, or a bare-library caller's own explicit
   * `seedMemStub(mem, flow)` call, is what actually fills mem before `run()`.
   */
  readonly memStub?: boolean;
  /**
   * `map({ input: CaseKey })`: the MemKey this flow takes as its input - one flow for many cases instead of one export
   * per case. Required like any `requires` key; given by `--input` (an array runs the flow once per item), `--data`,
   * a mem stub, or `.flow(sub, { input })`.
   */
  readonly input?: MemKey<unknown>;
  /** `map({ viewport })`: the browser size this flow plays at (`waygraph run`, `demo`, `test --flows`). */
  readonly viewport?: { width: number; height: number };
  /** `map({ exclusive: true })`: under `waygraph test --flows` it runs alone, after every other flow. */
  readonly exclusive?: boolean;
  /**
   * This Flow's constituent Blocks, in order between `start`/`end`, as plain
   * data - for introspection/visualization tools, without running anything.
   * @example loginFlow.blocks() // [{ name: "login" }, { name: "add-to-cart", routes: {...} }]
   */
  blocks(): readonly BlockInfo[];
  run(context: BrowserContext, mem: MemPage): Promise<Out>;
  /**
   * `options.closeOnFinish: false` hands the driven page back instead of
   * closing it - use this overload (a literal `false`, not a `boolean`) to
   * get the `{ result, page }` shape typed correctly.
   * @example const { result, page } = await loginFlow.run(context, mem, { closeOnFinish: false });
   */
  run(
    context: BrowserContext,
    mem: MemPage,
    options: RunGraphOptions & { closeOnFinish: false },
  ): Promise<{ result: Out; page: Page }>;
  /**
   * `options.page` drives that already-open page instead of opening a new
   * one - see {@link RunGraphOptions}.
   * @example await loginFlow.run(context, mem, { page: existingPage });
   */
  run(context: BrowserContext, mem: MemPage, options?: RunGraphOptions): Promise<Out>;
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
    block: SomeBlock | string | number,
    verify: Trait[] | ((out: Checkpoint<string>) => Trait[]),
  ): Flow<Out>;
  /**
   * Replaces one Trait inside the given Block's verify list - same rules as
   * {@link modVerify}. Throws if no Block in this Flow matches, or if that
   * Block has no verify trait at the given name/index.
   * @example checkoutFlow.modBlockVerify(LoginBlock, "url-matches", Trait.url({ pathname: "/inventory.html" }))
   */
  modBlockVerify(
    block: SomeBlock | string | number,
    nameOrIndex: string | number,
    newCheck: Trait["check"] | Trait,
  ): Flow<Out>;
}





export function buildFlow<Out extends Checkpoint<string>>(
  middle: readonly SomeBlock[],
  engineConfig: EngineConfig,
  cleanup: readonly SomeBlock[] = [],
): Flow<Out> {
  // Settings (sessionReset, memStub, ...) are added afterwards by withSettings, which re-applies them after any
  // withBlockVerify/modBlockVerify patch so they survive.
  // Layouts have to be threaded into every pairwise connect(), not just the
  // trailing runGraph call - see connect()'s own doc comment in types.ts:
  // buildFlow's reduce IS the only place a Flow's
  // intermediate (non-final) Checkpoints are ever verified at all.
  const chain = middle.reduce((a, b) => joinSteps(a, b, engineConfig.layouts));
  // Declared separately (not as the object-literal method below) so the
  // three-overload `Flow.run` signature can be checked against the actual
  // per-call-shape behavior, then attached with a cast - object-literal
  // methods can't satisfy TS's per-overload implementation check the way a
  // standalone function assigned to the property can.
  const run = async function run(
    contextOrMem: BrowserContext | MemPage,
    memOrConfig?: MemPage | EngineConfig,
    options?: RunGraphOptions,
  ): Promise<Out | { result: Out; page: Page }> {
    if (contextOrMem instanceof MemPage) {
      const mem = contextOrMem;
      const config: EngineConfig = { ...engineConfig, ...(memOrConfig as EngineConfig | undefined) };
      // Checked again inside runGraph too, but doing it here first means a
      // missing key fails before a browser process even launches, not just
      // before a page opens - the same "fail loud, cheaply" guarantee
      // run(context, mem) already has via an existing context.
      preflight(mem, chain);
      const { context, close } = await launchOwnContext(config);
      try {
        try {
          return await run(context, mem, config.layouts !== undefined ? { layouts: config.layouts } : undefined);
        } finally {
          // Playwright finalizes recordVideo on context.close(); skip when
          // not recording so mem-only runs with stub contexts stay unchanged.
          if (config.recordVideo) {
            await context.close();
          }
        }
      } finally {
        await close();
      }
    }
    const context = contextOrMem;
    const mem = memOrConfig as MemPage;
    // Open (or reuse) the page here, not inside runGraph, so this method -
    // not runGraph - decides whether to close it once the run is over; the
    // page reference has to survive past runGraph's own return either way.
    const gotOwnPage = options?.page === undefined;
    const page = options?.page ?? (await context.newPage());
    // Defaulting close-on-finish to `true` unconditionally would close a
    // page the *caller* opened and handed in via `options.page` - the exact
    // thing this option exists to let a caller keep driving. Only default to
    // closing when this call opened the page itself (no `options.page`
    // given), which is the one case that matches every `run(context, mem)`
    // call from before this option existed. An explicit `closeOnFinish`
    // always wins either way.
    const closeOnFinish = options?.closeOnFinish ?? gotOwnPage;
    const resolvedLayouts = options?.layouts ?? engineConfig.layouts;
    let result: Out;
    try {
      // A flow ends where its last step lands: the Out its map() chain was checked against.
      result = (await runSteps(chain, undefined, context, mem, 5000, {
        page,
        closeOnFinish: false,
        ...(resolvedLayouts !== undefined ? { layouts: resolvedLayouts } : {}),
      })) as Out;
    } finally {
      // Cleanup runs whether the steps passed or failed; its own failures don't replace theirs.
      await runCleanup(cleanup, context, mem, page, engineConfig);
    }
    if (closeOnFinish) {
      await page.close();
    }
    // The return *shape* only changes on an explicit `closeOnFinish: false`
    // (the literal the `{ result, page }` overload is typed against) - not
    // on the computed `closeOnFinish` default above. A caller who passed
    // their own `page` and left `closeOnFinish` unset already holds that
    // page reference; handing it back again in a different return shape
    // would silently break the plain-`Out` overload their call actually
    // matched at the type level.
    if (options?.closeOnFinish === false) {
      return { result, page };
    }
    return result;
  };
  return {
    resetSession: false,
    config: engineConfig,
    blocks: () => [
      ...middle.map((b) => ({
        name: b.name,
        block: b,
        ...(b.routes ? { routes: b.routes } : {}),
        ...((b as { __waygraphResetBefore?: boolean }).__waygraphResetBefore ? { resetSessionBefore: true } : {}),
      })),
      ...cleanup.map((b) => ({ name: b.name, block: b, cleanup: true as const })),
    ],
    run: run as Flow<Out>["run"],
    withBlockVerify(block, verify) {
      const { index, block: found } = findBlock(middle, block);
      const patched = [...middle];
      patched[index] = withVerify(found, verify);
      return buildFlow<Out>(patched, engineConfig, cleanup);
    },
    modBlockVerify(block, nameOrIndex, newCheck) {
      const { index, block: found } = findBlock(middle, block);
      const patched = [...middle];
      patched[index] = modVerify(found, nameOrIndex, newCheck);
      return buildFlow<Out>(patched, engineConfig, cleanup);
    },
  };
}


/** The settings `map({ ... })` gives a Flow. */
export interface FlowSettings {
  /** The flow's input key (`map({ input })`). */
  input?: MemKey<unknown>;
  viewport?: { width: number; height: number };
  exclusive?: boolean;
  /** Read by map()'s `.end()` (the first step sets them, a cleanup step puts them back). */
  timezone?: string;
  network?: import("./world.js").World["network"];
  /** Cleanup steps from `.finally(Block)`, in order. */
  finally?: readonly SomeBlock[];
  /** Read by map() when it begins (the sign-in step); the Flow itself keeps nothing of it. */
  as?: import("./account.js").Account;
  memStub?: boolean;
  sessionReset?: boolean;
  expectedFailure?: string;
  demoPace?: DemoPace;
  highlightStyle?: HighlightStyleDefaults;
}

/** The Flow with its `map()` settings set; they survive `withBlockVerify`/`modBlockVerify` patches. */
export function withSettings<Out extends Checkpoint<string>>(flow: Flow<Out>, settings: FlowSettings): Flow<Out> {
  const style = settings.highlightStyle;
  const fields = {
    ...(settings.sessionReset ? { resetSession: true } : {}),
    ...(settings.memStub ? { memStub: true } : {}),
    ...(settings.input ? { input: settings.input } : {}),
    ...(settings.viewport ? { viewport: settings.viewport } : {}),
    ...(settings.exclusive ? { exclusive: true } : {}),
    ...(settings.expectedFailure !== undefined ? { expectedFailureReason: settings.expectedFailure } : {}),
    ...(settings.demoPace ? { demoPace: settings.demoPace } : {}),
    ...(style
      ? {
          highlightStyle: {
            ...(style.tone !== undefined ? { tone: normalizeHighlightTone(style.tone) } : {}),
            ...(style.size !== undefined ? { size: normalizeHighlightSize(style.size) } : {}),
            ...(style.weight !== undefined ? { weight: normalizeHighlightWeight(style.weight) } : {}),
          },
        }
      : {}),
  };
  if (Object.keys(fields).length === 0) return flow;
  return {
    ...flow,
    ...fields,
    withBlockVerify: (block, verify) => withSettings(flow.withBlockVerify(block, verify), settings),
    modBlockVerify: (block, nameOrIndex, newCheck) => withSettings(flow.modBlockVerify(block, nameOrIndex, newCheck), settings),
  };
}


/**
 * Runs a flow's cleanup steps (`.finally(Block)`) one by one on its page. A cleanup step that fails is reported (on
 * stderr, and as its step:error) and the rest still run: cleanup never decides whether the flow passed.
 */
async function runCleanup(cleanup: readonly SomeBlock[], context: BrowserContext, mem: MemPage, page: Page, config: EngineConfig): Promise<void> {
  for (const block of cleanup) {
    try {
      await buildFlow([block], config).run(context, mem, { page, closeOnFinish: false });
    } catch (error) {
      console.error(`waygraph: cleanup "${block.name}" failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    }
  }
}

export async function clearSessionState(context: BrowserContext, page: Page): Promise<void> {
  await context.clearCookies().catch(ignorePageGone);
  await page
    .evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* storage blocked (e.g. about:blank) - nothing to clear anyway */
      }
    })
    .catch(ignorePageGone);
}


