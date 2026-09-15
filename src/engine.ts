import { chromium, firefox, webkit } from "@playwright/test";
import type { Browser, BrowserContext, BrowserType, Page, Locator } from "@playwright/test";
import type { Block, Checkpoint, Instruction, DefinedBlock, ActionPage, WaygraphHighlight } from "./types.js";
import { connect, checkpoint } from "./types.js";
import { MemPage } from "./mem-page.js";
import type { MemKey } from "./mem-page.js";
import type { Trait } from "./trait.js";
import { runVerify } from "./trait.js";

const LAUNCHERS = { chromium, firefox, webkit };

/**
 * Resolves which `BrowserType` actually launches for a `mem`-only run (no
 * caller-supplied context) - `config.browsers[browserName]` if given,
 * otherwise the real `@playwright/test` export. Waygraph is deliberately
 * "just an opinionated Playwright" - it doesn't own browser automation
 * itself, so it shouldn't force every consumer onto the vanilla launcher.
 * A stealth-patched or otherwise customized launcher (e.g. `playwright-extra`
 * plus a stealth plugin) is a drop-in replacement for `chromium`/`firefox`/
 * `webkit` - same `.launch()` shape - so accepting one here costs nothing for
 * a consumer who never sets it.
 */
function resolveLauncher(
  browserName: "chromium" | "firefox" | "webkit",
  config: EngineConfig | undefined,
): BrowserType {
  return config?.browsers?.[browserName] ?? LAUNCHERS[browserName];
}

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
  options?: RunGraphOptions,
): Promise<TOut> {
  preflight(mem, entry);
  const page = options?.page ?? (await context.newPage());
  const closeOnFinish = options?.closeOnFinish ?? true;
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
    if (closeOnFinish) {
      await page.close();
    }
  }
}

/** Options for `runGraph`'s trailing `options` arg and for {@link Flow.run}'s `options` overload. */
export interface RunGraphOptions {
  /**
   * Drive this already-open page instead of opening a new one via
   * `context.newPage()`. Lets a run continue on a tab the caller already
   * has open (e.g. one that's already logged in), instead of every run
   * being forced to start its own fresh tab and lose access to whatever was
   * already there.
   */
  page?: Page;
  /**
   * `Flow.run` defaults this to `true` only when it opened the page itself
   * (no `page` given) - matching every call from before this option
   * existed. If you pass your own `page`, it defaults to `false` instead:
   * a page you opened is yours to close, not this run's to close out from
   * under you. Either way an explicit value here always wins. `runGraph`
   * itself has no such page-aware default (its caller already decided
   * `page` and `closeOnFinish` together) - it just does what you ask.
   */
  closeOnFinish?: boolean;
}

/**
 * Drives a genuinely separate second tab through its own Block/Flow, in the
 * same browser context an existing `page` already belongs to - the primitive
 * `observe()` is specifically allowed to reach for (see {@link Instruction.observe}),
 * since `act`/`resolve` can't touch `page.context()` at all. A thin, named
 * wrapper around `runGraph` (which already opens its own page from whatever
 * context it's given) rather than a new mechanism - the point is making the
 * pattern discoverable and giving it a real name, not inventing new tab-lifecycle
 * logic. The spawned tab is closed (by `runGraph`'s own `finally`) before this
 * resolves; the original `page` is never touched.
 * @example
 * async observe(page, mem) {
 *   const receipt = await spawnTab(EmailReceiptFlow, page, mem);
 *   mem.set(ReceiptCode, receipt.__state);
 * }
 */
export async function spawnTab<TOut extends Checkpoint<string>>(
  entry: Block<Checkpoint<"__start__">, TOut>,
  page: Page,
  mem: MemPage,
  maxSteps = 5000,
): Promise<TOut> {
  return runGraph<TOut>(entry, undefined, page.context(), mem, maxSteps);
}

/**
 * Wraps one `act()` interaction with a caption and highlight, for a Block
 * author who wants to explicitly narrate a specific step rather than rely
 * on the generic per-fill/per-click narration `waygraph chain
 * WAYGRAPH_STEP=1` already does automatically -
 * `await narrate(submitButton, "confirms the order", () => submitButton.click())`
 * reads at the call site instead of being inferred.
 *
 * A true no-op everywhere except inside a `WAYGRAPH_STEP=1` run: it checks
 * for a `window.__wgPositionRing` hook the step-mode overlay installs on
 * the page before doing anything, so a headless/CI/automated run (nobody
 * watching, per-character delays and highlight pauses would just be wasted
 * time) pays zero extra cost - not even the boundingBox() lookup runs. The
 * `action` itself always runs regardless; only the narration is
 * conditional.
 * @example await narrate(submitButton, "confirms the order", () => submitButton.click())
 */
export async function narrate<T>(
  locator: Locator,
  caption: string,
  action: () => Promise<T>,
): Promise<T> {
  const page = locator.page();
  const active = await page
    .evaluate(() => typeof (globalThis as unknown as { __wgPositionRing?: unknown }).__wgPositionRing === "function")
    .catch(() => false);
  if (!active) return action();
  let owning = false;
  try {
    const box = await locator.boundingBox();
    if (box) {
      await page
        .evaluate(
          ({ box, caption }) => {
            const w = globalThis as unknown as {
              __wgPositionRing?: (box: unknown, label: string) => void;
              __wgLastNarrate?: number;
              __wgNarrateOwnsRing?: boolean;
            };
            if (w.__wgPositionRing) w.__wgPositionRing(box, caption);
            // The CLI's own automatic per-fill/per-click narration checks
            // this before showing (and overwriting) its own guess - an
            // explicitly authored caption should win, not get immediately
            // replaced a moment later by the generic one.
            w.__wgLastNarrate = Date.now();
            // Also claim the ring itself: the auto-highlight click/fill
            // patches each hide the ring right after THEIR own step
            // finishes, which - if action() below does more than one thing
            // (e.g. a click then a wait for a toast) - would wipe this
            // caption after just the first sub-step instead of the whole
            // narrated action. Their hideRing() calls no-op while this is
            // true; narrate() below is the one that actually clears it.
            w.__wgNarrateOwnsRing = true;
          },
          { box, caption },
        )
        .catch(() => {});
      owning = true;
      // The ring alone is pointless if action() fires on the very next
      // tick - a click that navigates (e.g. a form submit) wipes the ring
      // before a human can read the caption at all. Give it the same
      // "pop for a few seconds" dwell as the CLI's own auto-highlight
      // clicks before the real action runs.
      await new Promise((resolve) => setTimeout(resolve, 650));
      // Re-stamp __wgLastNarrate right before handing off to action() - the
      // CLI's auto-highlight patches only treat a narrate() as "just
      // handled" within a short window (500ms), which the dwell above
      // already burned through. Without this, action()'s own click/fill
      // (same patched Locator prototype) would stomp this caption with its
      // own generic one a moment after it finally became visible.
      await page
        .evaluate(() => {
          (globalThis as unknown as { __wgLastNarrate?: number }).__wgLastNarrate = Date.now();
        })
        .catch(() => {});
    }
  } catch {
    // best-effort - the real action below still runs either way
  }
  try {
    return await action();
  } finally {
    if (owning) {
      await page
        .evaluate(() => {
          const w = globalThis as unknown as {
            __wgNarrateOwnsRing?: boolean;
            __wgHideRing?: () => void;
          };
          w.__wgNarrateOwnsRing = false;
          if (w.__wgHideRing) w.__wgHideRing();
        })
        .catch(() => {});
    }
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
  // resetSession/title start false/unset here - defineFlow itself carries
  // no such options anymore. They're set by wrapping the result in
  // withSessionReset()/withTitle() instead (non-destructive decorators,
  // same pattern as withVerify), which also re-apply themselves after any
  // further withBlockVerify/modBlockVerify patch so the flag survives.
  const chain = middle.reduce((a, b) => connect(a, b)) as unknown as Block<
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
        const context = await browser.newContext();
        return await runGraph<Out>(chain, undefined, context, mem);
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
    const result = await runGraph<Out>(chain, undefined, context, mem, 5000, {
      page,
      closeOnFinish: false,
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
        const context = await browser.newContext();
        return await run(context, mem, { closeOnFinish: true });
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

/** Configures how an Engine launches its own browser - only used by `Flow.run(mem)` (no context given); ignored by `Flow.run(context, mem)`, since that context is already launched. */
export interface EngineConfig {
  /** Default `true`, matching Playwright's own default. */
  headless?: boolean;
  /** Default `"chromium"`. */
  browserName?: "chromium" | "firefox" | "webkit";
  /** Milliseconds Playwright pauses before each operation - for watching a non-headless run with your own eyes, not for real runs. Default `0`. */
  slowMo?: number;
  /**
   * Overrides which `BrowserType` actually launches, per browser name -
   * default is the real `@playwright/test` export for whichever one
   * `browserName` picks. Accepts anything shaped like Playwright's own
   * `chromium`/`firefox`/`webkit` (same `.launch()` signature) - a
   * stealth-patched or otherwise customized launcher (e.g. `playwright-extra`
   * plus a stealth plugin) drops in here unmodified. Puppeteer is a
   * different `Page`/`BrowserContext` shape entirely and isn't supported by
   * this seam.
   * @example new Engine({ browsers: { chromium: stealthChromium } })
   */
  browsers?: Partial<Record<"chromium" | "firefox" | "webkit", BrowserType>>;
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
  defineFlow<B extends Checkpoint<string>>(
    blocks: readonly [StartMarker, Block<S, B>, EndMarker],
  ): Flow<B>;
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
  const routesAsData: Record<string, string | null> = {};
  for (const [tag, target] of Object.entries(routes as Record<string, Block<any, any> | null>)) {
    routesAsData[tag] = target === null ? null : target === block ? base.name : target.name;
  }
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
    routes: routesAsData,
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
): {
  name: string;
  description?: Block<In, Out>["description"];
  instruction: Block<In, Out>["instruction"];
  next?: Block<In, Out>["next"];
  requires?: Block<In, Out>["requires"];
  routes?: Block<In, Out>["routes"];
} {
  return {
    name: block.name,
    instruction: block.instruction,
    ...(block.description ? { description: block.description } : {}),
    ...(block.next ? { next: block.next } : {}),
    ...(block.requires ? { requires: block.requires } : {}),
    ...(block.routes ? { routes: block.routes } : {}),
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
}): DefinedBlock<In, Out> {
  const plain: Block<In, Out> = {
    name: base.name,
    instruction: base.instruction,
    ...(base.description ? { description: base.description } : {}),
    ...(base.next ? { next: base.next } : {}),
    ...(base.requires ? { requires: base.requires } : {}),
    ...(base.routes ? { routes: base.routes } : {}),
  };
  return {
    ...plain,
    withVerify: (verify) => withVerify(plain, verify),
    modVerify: (nameOrIndex, newCheck) => modVerify(plain, nameOrIndex, newCheck),
    modVerifyAll: (patches) => modVerifyAll(plain, patches),
  };
}

/**
 * A Block whose only possible action is navigating to a URL - built via
 * {@link defineNavBlock}, never with a hand-authored `act()`. Extends `Block`
 * (same shape `DefinedBlock`/`ComposedBlock` already use), so it drops into
 * `defineFlow([...])`, `connect()`, `composeBlock()` exactly like any other
 * Block - no special-casing needed anywhere that only expects a `Block`.
 * See `openspec/changes/nav-block-and-check/` for why this exists.
 */
export type NavBlock<Out extends Checkpoint<string>> = DefinedBlock<Checkpoint<string>, Out>;

/**
 * Builds a {@link NavBlock}. `url` accepts a plain string or a function
 * `(mem) => string` for parameterized routes (e.g. `/dashboard/requests/:id`
 * with a real id read from mem). `checkpoint` is the tag this NavBlock
 * resolves to once navigation completes - a NavBlock never branches on
 * observed evidence the way a regular Block can, so there's no `resolve`
 * logic to author; it always just declares "arrived."
 *
 * The generated `act()` is always exactly `page.goto(url)` - never anything
 * else, never author-supplied. Callers get a real `Page` here internally
 * (the one legitimate place navigation belongs); `defineBlock`'s own
 * `ActionPage` narrowing is what discourages navigation everywhere else,
 * and never applies to this generated function since no author ever writes
 * it by hand.
 * @example defineNavBlock({ name: "nav-web-login", checkpoint: "LoginForm", url: "/login" })
 * @example defineNavBlock({ name: "nav-web-request-detail", checkpoint: "RequestDetail", url: (mem) => `/dashboard/requests/${mem.get(RequestId.key)}` })
 */
export function defineNavBlock<Out extends Checkpoint<string>>(options: {
  name: string;
  description?: string;
  checkpoint: Out["__state"];
  url: string | ((mem: MemPage) => string);
  requires?: readonly MemKey<any>[];
  verify?: Trait[] | ((out: Out) => Trait[]);
  highlights?:
    | readonly WaygraphHighlight[]
    | ((out: Out) => readonly WaygraphHighlight[]);
}): NavBlock<Out> {
  const built = defineBlock<Checkpoint<string>, Out>({
    name: options.name,
    ...(options.description ? { description: options.description } : {}),
    ...(options.requires ? { requires: options.requires } : {}),
    instruction: {
      async act(page, _input, mem) {
        const url = typeof options.url === "function" ? options.url(mem) : options.url;
        await (page as unknown as Page).goto(url);
      },
      resolve: () => checkpoint(options.checkpoint) as Out,
      ...(options.verify ? { verify: options.verify } : {}),
      ...(options.highlights ? { highlights: options.highlights } : {}),
    },
  });
  // Non-enumerable so it never shows up in Object.keys/JSON/autocomplete -
  // purely a runtime marker `waygraph check` (or anything else walking a
  // project's Blocks) can test for to tell a NavBlock apart from a regular
  // one, since the TypeScript type alone (NavBlock = DefinedBlock) doesn't
  // survive to runtime.
  Object.defineProperty(built, "__waygraphKind", {
    value: "nav",
    enumerable: false,
    configurable: false,
  });
  return built;
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
