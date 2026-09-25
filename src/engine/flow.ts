// Split out of the former 2,900-line engine.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { connect } from "../types.js";
import type { Block, Checkpoint } from "../types.js";
import { preflight, runGraph } from "./run-graph.js";
import type { RunGraphOptions } from "./run-graph.js";
import { resolveLauncher } from "./config.js";
import type { EngineConfig } from "./config.js";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { MemPage } from "../mem-page.js";
import type { Trait } from "../trait.js";
import { findBlockIndex, modVerify, withVerify } from "./core.js";
import { normalizeHighlightSize, normalizeHighlightTone, normalizeHighlightWeight } from "../highlights.js";
import type { DemoPace, HighlightStyleDefaults } from "../highlights.js";

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
   * True when {@link chainFlow} inserted a session-reset boundary
   * immediately before this Block - i.e. this is the first Block of a
   * sub-flow that was wrapped in {@link withSessionReset}, and it isn't
   * the very first sub-flow in the chain. Absent (not just false) from
   * `Flow.blocks()` on an ordinary, non-chained Flow.
   */
  resetSessionBefore?: boolean;
  /**
   * The actual Block, re-runnable on its own via
   * `engine.defineFlow([start, info.block, end])` - e.g. step-through
   * tooling that runs a Flow's Blocks one at a time. Introspection that only
   * wants to read the shape (a visualizer) can ignore this and use `name`/
   * `routes` alone.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  block: Block<any, any>;
}


export interface Flow<Out extends Checkpoint<string>> {
  /**
   * True once this Flow has been wrapped in {@link withSessionReset} - a
   * hint for `chainFlow`, not something `run()` itself checks: it marks
   * this Flow as one that expects to start from a genuinely fresh,
   * unauthenticated browser state (e.g. a login flow meant to be
   * re-entered later in a longer chain). `chainFlow` clears cookies and
   * storage right before this Flow's first Block runs, but only when this
   * Flow isn't the very first thing in the chain (nothing to reset yet).
   */
  readonly resetSession: boolean;
  /**
   * Set once this Flow has been wrapped in {@link withTitle} - a display
   * hint for a step-through overlay/showcase (e.g. "Ticket #123"), not
   * something `run()` itself uses.
   */
  readonly title?: string;
  /**
   * Set once this Flow has been wrapped in {@link withExpectedFailure} - a
   * display hint for a step-through overlay: this Flow is DESIGNED to throw
   * (e.g. a blocked user's login attempt genuinely failing), not a bug in
   * the demo itself. `run()` never reads this - the Flow still throws
   * exactly as it would otherwise; only the overlay's error panel reads it,
   * to show an informational "this is the point" panel instead of an
   * alarming one indistinguishable from a real break.
   */
  readonly expectedFailureReason?: string;
  /**
   * Set once this Flow has been wrapped in {@link withHighlightFixtures} -
   * demo narration overrides (unlimited purposes on `.flow.ts`) keyed by
   * block.name. `run()` never reads this; step/`demo` merges onto block stubs.
   */
  readonly highlightFixtures?: import("../highlights.js").HighlightFixtureMap;
  /**
   * Demo pacing for this Flow's episode (`withDemoPace`).
   * `run()` ignores; step/demo applies per Block in the episode.
   */
  readonly demoPace?: import("../highlights.js").DemoPace;
  /**
   * Default highlight size/weight/tone for this Flow's episode (`withHighlightStyle`).
   * Per-slot stub/fixture values win. `run()` ignores.
   */
  readonly highlightStyle?: import("../highlights.js").HighlightStyleDefaults;
  /**
   * Set once this Flow has been wrapped in {@link withMemStub} - opts into
   * auto-filling `requires` keys with registered fake values
   * (`registerMemStub`, `src/mem-stub.ts`) instead of failing preflight when
   * the caller didn't supply them. `run()` never reads this - the CLI's own
   * `--data`/`--mem-stub` seeding, or a bare-library caller's own explicit
   * `seedMemStub(mem, flow)` call, is what actually fills mem before `run()`.
   */
  readonly memStub?: boolean;
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


export function buildFlow<Out extends Checkpoint<string>>(
  middle: readonly Block<any, any>[],
  engineConfig: EngineConfig,
): Flow<Out> {
  // resetSession/title start false/unset here - defineFlow itself carries
  // no such options anymore. They're set by wrapping the result in
  // withSessionReset()/withTitle() instead (non-destructive decorators,
  // same pattern as withVerify), which also re-apply themselves after any
  // further withBlockVerify/modBlockVerify patch so the flag survives.
  // Layouts have to be threaded into every pairwise connect(), not just the
  // trailing runGraph call - see connect()'s own doc comment in types.ts:
  // buildFlow's reduce IS the only place a defineFlow-built Flow's
  // intermediate (non-final) Checkpoints are ever verified at all.
  const chain = middle.reduce((a, b) => connect(a, b, engineConfig.layouts)) as unknown as Block<
    Checkpoint<"__start__">,
    Out
  >;
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
      const browserName = config.browserName ?? "chromium";
      const launch = resolveLauncher(browserName, config);
      // If CHROME_PATH/CHROMIUM_PATH is set in the environment (e.g. a system
      // or Flatpak Chromium), launch that instead of Playwright's own bundled
      // binary - only for chromium (the env var names a Chromium build, not a
      // Firefox/WebKit one), and a no-op default anywhere that env var isn't set.
      const executablePath =
        browserName === "chromium" ? process.env.CHROME_PATH || process.env.CHROMIUM_PATH : undefined;
      const browser: Browser = await launch.launch({
        headless: config.headless ?? true,
        ...(config.slowMo !== undefined ? { slowMo: config.slowMo } : {}),
        ...(executablePath ? { executablePath } : {}),
      });
      try {
        const context = await browser.newContext(
          config.recordVideo ? { recordVideo: config.recordVideo } : {},
        );
        try {
          return await runGraph<Out>(chain, undefined, context, mem, 5000, {
            ...(config.layouts !== undefined ? { layouts: config.layouts } : {}),
          });
        } finally {
          // Playwright finalizes recordVideo on context.close(); skip when
          // not recording so mem-only runs with stub contexts stay unchanged.
          if (config.recordVideo) {
            await context.close();
          }
        }
      } finally {
        await browser.close();
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
    const result = await runGraph<Out>(chain, undefined, context, mem, 5000, {
      page,
      closeOnFinish: false,
      ...(resolvedLayouts !== undefined ? { layouts: resolvedLayouts } : {}),
    });
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
    blocks: () => middle.map((b) => ({ name: b.name, block: b, ...(b.routes ? { routes: b.routes } : {}) })),
    run: run as Flow<Out>["run"],
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


/**
 * Marks a Flow as expecting to start from a genuinely fresh, unauthenticated
 * browser state - e.g. a login flow meant to be re-entered later in a longer
 * showcase. Non-destructive, same pattern as {@link withVerify}: returns a
 * new Flow: the original is untouched, and the flag survives any further
 * `withBlockVerify`/`modBlockVerify` patch applied to the result.
 *
 * By itself this does nothing - `Flow.run()` never reads `resetSession`.
 * It's a hint {@link chainFlow} looks for: right before this Flow's first
 * Block runs (skipped if it's the very first thing in the chain - nothing
 * to reset yet), chainFlow clears cookies and storage so this Flow starts
 * exactly as if a human had opened the app fresh, not wherever the
 * previous Flow in the chain happened to leave the page.
 * @example const loginFlow = withSessionReset(engine.defineFlow([start, LoginBlock, end]));
 */
export function withSessionReset<Out extends Checkpoint<string>>(flow: Flow<Out>): Flow<Out> {
  return {
    ...flow,
    resetSession: true,
    withBlockVerify: (block, verify) => withSessionReset(flow.withBlockVerify(block, verify)),
    modBlockVerify: (block, nameOrIndex, newCheck) => withSessionReset(flow.modBlockVerify(block, nameOrIndex, newCheck)),
  };
}


/**
 * Names a Flow for display - a step-through overlay/showcase (waygraph's
 * `chain --step`) shows this as the running banner while this Flow's own
 * Blocks are executing, instead of one fixed title for the whole run.
 * Non-destructive, same pattern as {@link withSessionReset}.
 * @example const ticket123 = withTitle(loginFlow, "Ticket #123 - Sales rep signs in");
 */
export function withTitle<Out extends Checkpoint<string>>(flow: Flow<Out>, title: string): Flow<Out> {
  return {
    ...flow,
    title,
    withBlockVerify: (block, verify) => withTitle(flow.withBlockVerify(block, verify), title),
    modBlockVerify: (block, nameOrIndex, newCheck) => withTitle(flow.modBlockVerify(block, nameOrIndex, newCheck), title),
  };
}


/**
 * Opts this Flow into memStub: `requires` keys the caller didn't supply get
 * filled from `registerMemStub`'s registry (`src/mem-stub.ts`) instead of
 * failing preflight, for any key that has a registered fake generator - a
 * required key with no registration still fails exactly as before.
 * Non-destructive, same pattern as {@link withTitle}. `run()` never reads
 * this itself - the CLI's `--data`/`--mem-stub` seeding, or a bare-library
 * caller's own explicit `seedMemStub(mem, flow)` call, does the filling.
 * @example const demoLogin = withMemStub(loginFlow);
 */
export function withMemStub<Out extends Checkpoint<string>>(flow: Flow<Out>): Flow<Out> {
  return {
    ...flow,
    memStub: true,
    withBlockVerify: (block, verify) => withMemStub(flow.withBlockVerify(block, verify)),
    modBlockVerify: (block, nameOrIndex, newCheck) => withMemStub(flow.modBlockVerify(block, nameOrIndex, newCheck)),
  };
}


/**
 * Demo pacing for a whole Flow episode (fast review vs slow gap/wrong walkthrough).
 * Non-destructive. `fastForwardComposeBlock` is always blitz for its own step;
 * use this when an entire episode should be fast or slow.
 * @example withDemoPace(withTitle(gapFlow, "Episode 2 - gaps"), "slow")
 * @example withDemoPace(happyFlow, 0.5)  // 2x faster than normal
 * @example withDemoPace(gapFlow, 2.5)    // 2.5x slower
 * @example withDemoPace(gapFlow, 4500)   // absolute ~4.5s gates/dwells
 */
export function withDemoPace<Out extends Checkpoint<string>>(
  flow: Flow<Out>,
  pace: DemoPace,
): Flow<Out> {
  const demoPace = pace;
  return {
    ...flow,
    demoPace,
    withBlockVerify: (block, verify) => withDemoPace(flow.withBlockVerify(block, verify), demoPace),
    modBlockVerify: (block, nameOrIndex, newCheck) =>
      withDemoPace(flow.modBlockVerify(block, nameOrIndex, newCheck), demoPace),
  };
}


/**
 * Default highlight look for a Flow episode (size / weight / optional tone).
 * Per-slot stub or {@link withHighlightFixtures} values win when set.
 * @example withHighlightStyle(withDemoPace(gapFlow, "slow"), { size: "lg", weight: "bold" })
 */
export function withHighlightStyle<Out extends Checkpoint<string>>(
  flow: Flow<Out>,
  style: HighlightStyleDefaults,
): Flow<Out> {
  const highlightStyle: HighlightStyleDefaults = {
    ...(style.tone !== undefined ? { tone: normalizeHighlightTone(style.tone) } : {}),
    ...(style.size !== undefined ? { size: normalizeHighlightSize(style.size) } : {}),
    ...(style.weight !== undefined ? { weight: normalizeHighlightWeight(style.weight) } : {}),
  };
  return {
    ...flow,
    highlightStyle,
    withBlockVerify: (block, verify) => withHighlightStyle(flow.withBlockVerify(block, verify), highlightStyle),
    modBlockVerify: (block, nameOrIndex, newCheck) =>
      withHighlightStyle(flow.modBlockVerify(block, nameOrIndex, newCheck), highlightStyle),
  };
}


/**
 * Demo pacing for one Block or compose unit (not FF - use fastForwardComposeBlock for blitz).
 * @example withBlockPace(composeBlock("gap-review", [...]), "slow")
 */
export function withBlockPace<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  block: Block<In, Out>,
  pace: DemoPace,
): Block<In, Out> {
  return {
    ...block,
    demoPace: pace,
  } as Block<In, Out> & { demoPace: DemoPace };
}


/**
 * Marks a Flow as one that's SUPPOSED to throw - e.g. a locked-out user's
 * login attempt genuinely failing, demonstrating the app's own real
 * behavior rather than a bug in the demo. Non-destructive, same pattern as
 * {@link withTitle}.
 *
 * By itself this changes nothing about how the Flow runs - it still throws
 * Marks a Flow whose last step is an intentional product failure (demo overlay).
 * Step mode shows stubOnError rings + an amber "expected outcome" panel when:
 * - the last block **throws**, or
 * - the last block **succeeds** on the fail branch (e.g. LoginPage + error banner
 *   after submit-login branched instead of throwing).
 * Headless `run()` is unchanged - branching success returns the checkpoint.
 * @example const viewerBlockedFlow = withExpectedFailure(
 *   engine.defineFlow([start, NavLoginBlock, SubmitLoginActionBlock, end]),
 *   "locked_out_user stays on LoginPage with the error banner - working as intended.",
 * );
 */
export function withExpectedFailure<Out extends Checkpoint<string>>(flow: Flow<Out>, reason: string): Flow<Out> {
  return {
    ...flow,
    expectedFailureReason: reason,
    withBlockVerify: (block, verify) => withExpectedFailure(flow.withBlockVerify(block, verify), reason),
    modBlockVerify: (block, nameOrIndex, newCheck) =>
      withExpectedFailure(flow.modBlockVerify(block, nameOrIndex, newCheck), reason),
  };
}


/**
 * Attaches demo highlight fixtures to a Flow - unlimited purposes on `.flow.ts`
 * (AC copy, BUG/GATE tags, detail) merged onto each block's stubBefore/stubAfter/
 * stubOnError slots. Non-destructive, same pattern as {@link withTitle}.
 * Demo/`chain --step` reads `flow.highlightFixtures`; `run()` ignores it.
 * @example withHighlightFixtures(issueFlow, { "submit-login": { stubBefore: { email: { label: "AC-1" } } } })
 */
export function withHighlightFixtures<Out extends Checkpoint<string>>(
  flow: Flow<Out>,
  fixtures: import("../highlights.js").HighlightFixtureMap,
): Flow<Out> {
  return {
    ...flow,
    highlightFixtures: fixtures,
    withBlockVerify: (block, verify) => withHighlightFixtures(flow.withBlockVerify(block, verify), fixtures),
    modBlockVerify: (block, nameOrIndex, newCheck) =>
      withHighlightFixtures(flow.modBlockVerify(block, nameOrIndex, newCheck), fixtures),
  };
}


function locateInChain(
  flows: readonly Flow<any>[],
  block: Block<any, any> | string | number,
): { flowIndex: number; localIndex: number } {
  if (typeof block === "number") {
    let remaining = block;
    for (let fi = 0; fi < flows.length; fi++) {
      const len = flows[fi]!.blocks().length;
      if (remaining < len) return { flowIndex: fi, localIndex: remaining };
      remaining -= len;
    }
    throw new Error(`chainFlow: no Block at index ${block} across ${flows.length} chained flows`);
  }
  const blockName = typeof block === "string" ? block : block.name;
  for (let fi = 0; fi < flows.length; fi++) {
    const localIndex = flows[fi]!.blocks().findIndex((bi) => bi.name === blockName);
    if (localIndex !== -1) return { flowIndex: fi, localIndex };
  }
  throw new Error(`chainFlow: no Block named "${blockName}" in any chained flow`);
}


async function clearSessionState(context: BrowserContext, page: Page): Promise<void> {
  await context.clearCookies().catch(() => {});
  await page
    .evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* storage blocked (e.g. about:blank) - nothing to clear anyway */
      }
    })
    .catch(() => {});
}


/**
 * Runs several complete, independent Flows one after another, reusing the
 * same page/context/mem in order - each remains its own validated
 * start-to-end unit (a Flow's own `[start, ...blocks, end]` contract is
 * untouched), this only sequences whole Flows. Deliberately NOT the same
 * thing as {@link composeBlock}: composeBlock nests several Blocks into
 * one Block that can drop back into another `defineFlow([...])` - a
 * chainFlow result is a Flow, but not meant to be nested inside another
 * Flow's own Block list. Recursive nesting stays composeBlock's job alone;
 * chainFlow is a flat, one-level sequencing of complete showcases (e.g.
 * "ticket #123 end to end, then ticket #456 end to end").
 *
 * A sub-flow wrapped in {@link withSessionReset} gets its cookies/storage
 * cleared right before it runs (skipped for the very first flow in the
 * chain - nothing to reset yet). The combined result is whatever the LAST
 * flow resolved to.
 * @example chainFlow(ticket123Flow, ticket456Flow).run(context, mem)
 */
export function chainFlow(...flows: readonly Flow<any>[]): Flow<any> {
  if (flows.length === 0) {
    throw new Error("chainFlow: give at least one Flow");
  }
  const run = async function run(
    contextOrMem: BrowserContext | MemPage,
    memOrConfig?: MemPage | EngineConfig,
    options?: RunGraphOptions,
  ): Promise<unknown> {
    if (contextOrMem instanceof MemPage) {
      const mem = contextOrMem;
      const config = memOrConfig as EngineConfig | undefined;
      // One browser for the WHOLE chain - each sub-flow's own run(mem,
      // config) would otherwise each launch a separate browser, defeating
      // the point of sequencing them (a fresh browser is itself a full
      // session reset, silently making withSessionReset a no-op).
      const browserName = config?.browserName ?? "chromium";
      const launch = resolveLauncher(browserName, config);
      const executablePath =
        browserName === "chromium" ? process.env.CHROME_PATH || process.env.CHROMIUM_PATH : undefined;
      const browser: Browser = await launch.launch({
        headless: config?.headless ?? true,
        ...(config?.slowMo !== undefined ? { slowMo: config.slowMo } : {}),
        ...(executablePath ? { executablePath } : {}),
      });
      try {
        const context = await browser.newContext(
          config?.recordVideo ? { recordVideo: config.recordVideo } : {},
        );
        try {
          return await run(context, mem, { closeOnFinish: true });
        } finally {
          await context.close();
        }
      } finally {
        await browser.close();
      }
    }
    const context = contextOrMem;
    const mem = memOrConfig as MemPage;
    const gotOwnPage = options?.page === undefined;
    const page = options?.page ?? (await context.newPage());
    const closeOnFinish = options?.closeOnFinish ?? gotOwnPage;
    let result: unknown;
    for (let i = 0; i < flows.length; i++) {
      const flow = flows[i]!;
      if (i > 0 && flow.resetSession) {
        await clearSessionState(context, page);
      }
      const outcome = (await flow.run(context, mem, { page, closeOnFinish: false })) as { result: unknown };
      result = outcome.result;
    }
    if (closeOnFinish) {
      await page.close();
    }
    if (options?.closeOnFinish === false) {
      return { result, page };
    }
    return result;
  };
  return {
    resetSession: false,
    blocks: () =>
      flows.flatMap((flow, idx) =>
        flow.blocks().map((bi, i) => ({
          ...bi,
          ...(i === 0 && idx > 0 && flow.resetSession ? { resetSessionBefore: true } : {}),
        })),
      ),
    run: run as Flow<any>["run"],
    withBlockVerify(block, verify) {
      const { flowIndex, localIndex } = locateInChain(flows, block);
      const patched = [...flows];
      patched[flowIndex] = patched[flowIndex]!.withBlockVerify(localIndex, verify);
      return chainFlow(...patched);
    },
    modBlockVerify(block, nameOrIndex, newCheck) {
      const { flowIndex, localIndex } = locateInChain(flows, block);
      const patched = [...flows];
      patched[flowIndex] = patched[flowIndex]!.modBlockVerify(localIndex, nameOrIndex, newCheck);
      return chainFlow(...patched);
    },
  };
}
