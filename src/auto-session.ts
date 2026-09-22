/**
 * Session core for `waygraph auto --cli` session control (detach/attach/send/status).
 *
 * `AutoSession` is a standalone consumer of the same low-level helpers
 * `runAutoExplore` (auto-explore-run.ts) already uses - it does NOT share code
 * with that function's own loop body, by design: foreground `--cli` and
 * headful behavior must stay byte-for-byte unchanged, so nothing here can
 * affect them even indirectly. See openspec/changes/waygraph-auto-cli-session-control.
 */
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Engine, MemPage } from "./index.js";
import type { Checkpoint, WaygraphInstanceOption } from "./types.js";
import {
  buildExploreContext,
  buildExploreMenu,
  type BlockEntry,
  type ExploreMenu,
} from "./auto-explore.js";
import {
  ensureLivePage,
  detectHere,
  seedDefaultMem,
  ensureMem,
  runOneBlock,
  resolveBaseUrl,
  type PickResult,
} from "./auto-explore-run.js";
import { runStubPhase, type StubPhaseResult } from "./highlights.js";
import { findBlockPathDetailed } from "./graph.js";
import {
  updatePilotOverlay,
  showPilotActivity,
  showPilotVision,
  showPilotFixtures,
  installPersistentPilotOverlay,
  type PilotOverlayInfo,
} from "./pilot-overlay.js";
import type { PilotHighlightFixtures } from "./pilot-overlay.js";
import {
  collectKnownInteractionSelectors,
  unmappedInteractionsPageScript,
  type UnmappedInteractionPayload,
} from "./coverage-gap.js";

/** True when a stub-phase result actually carries authored content worth keeping. */
function stubPhaseHasContent(r: StubPhaseResult): boolean {
  return (
    Object.keys(r.highlights).length > 0 ||
    r.todos.length > 0 ||
    r.device !== undefined ||
    r.todoDock !== undefined
  );
}

export interface SessionSnapshotEdge {
  /** 1-based, matching the numbers a human/agent picks by (same as printCliMenu). */
  index: number;
  block: string;
  kind: "nav" | "action";
  to: string;
  label?: string;
  description?: string;
}

export interface SessionSnapshotSection {
  title: string;
  edges: SessionSnapshotEdge[];
}

export interface SessionSnapshot {
  here: string | null;
  sections: SessionSnapshotSection[];
  /** True when there are no runnable moves from `here` right now. */
  done: boolean;
  lastRunNote: string | null;
}

/** Plain, JSON-serializable view of a menu - no Block/MemKey/class references. */
export function buildSessionSnapshot(
  menu: ExploreMenu,
  library: Map<string, BlockEntry>,
  here: string | null,
  lastRunNote: string | null,
): SessionSnapshot {
  let n = 0;
  const sections: SessionSnapshotSection[] = menu.sections.map((section) => ({
    title: section.title,
    edges: section.edges.map((edge) => {
      n++;
      const entry = library.get(edge.block);
      return {
        index: n,
        block: edge.block,
        kind: edge.kind,
        to: edge.to,
        ...(edge.label ? { label: edge.label } : {}),
        ...(entry?.description ? { description: entry.description } : {}),
      };
    }),
  }));
  return { here, sections, done: menu.flat.length === 0, lastRunNote };
}

export type ParsedPick = PickResult | { type: "invalid"; reason: string };

/**
 * Same number/`q`/range rules `cliPick` already applies, but returning a
 * result instead of looping to re-prompt - one request gets one answer.
 */
export function parsePick(raw: string, menuLength: number): ParsedPick {
  const ans = raw.trim().toLowerCase();
  if (ans === "q" || ans === "quit") return { type: "quit" };
  const n = Number(ans);
  if (Number.isInteger(n) && n >= 1 && n <= menuLength) {
    return { type: "pick", index: n - 1 };
  }
  return {
    type: "invalid",
    reason: `"${raw}" is not a valid pick - enter a number from 1 to ${menuLength}, or "q" to quit`,
  };
}

export interface DomSnapshot {
  mode: "aria" | "full";
  selector?: string;
  /** Always false for aria mode - Playwright's own ariaSnapshotJSON bounds itself. */
  truncated: boolean;
  tree: unknown;
}

export interface InspectDomOptions {
  mode?: "aria" | "full";
  /** Scopes either mode to one element's subtree - a modifier, not a third mode. */
  selector?: string;
  depth?: number;
}

export type InspectDomResult =
  | { ok: true; snapshot: DomSnapshot }
  | { ok: false; error: string };

const FULL_MODE_DEFAULT_DEPTH = 12;
const FULL_MODE_MAX_NODES = 800;
const FULL_MODE_MAX_TEXT_LENGTH = 300;

interface FullDomNode {
  tag: string;
  attrs?: Record<string, string>;
  text?: string;
  children?: FullDomNode[];
}

interface FullDomCaps {
  depth: number;
  maxNodes: number;
  maxTextLength: number;
}

/** Runs entirely inside the browser (page.evaluate) - no closures over outer TS state. */
function walkFullDom(root: Element, caps: FullDomCaps): { tree: FullDomNode; truncated: boolean } {
  let count = 0;
  let truncated = false;
  function walk(el: Element, depth: number): FullDomNode | null {
    if (depth > caps.depth) {
      truncated = true;
      return null;
    }
    if (count >= caps.maxNodes) {
      truncated = true;
      return null;
    }
    count++;
    const node: FullDomNode = { tag: el.tagName.toLowerCase() };
    const attrs: Record<string, string> = {};
    for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;
    if (Object.keys(attrs).length > 0) node.attrs = attrs;
    const directText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? "")
      .join("")
      .trim();
    if (directText) {
      node.text =
        directText.length > caps.maxTextLength
          ? directText.slice(0, caps.maxTextLength) + "..."
          : directText;
    }
    const children: FullDomNode[] = [];
    for (const child of Array.from(el.children)) {
      if (count >= caps.maxNodes) {
        truncated = true;
        break;
      }
      const c = walk(child, depth + 1);
      if (c) children.push(c);
    }
    if (children.length > 0) node.children = children;
    return node;
  }
  const tree = walk(root, 0) ?? { tag: root.tagName.toLowerCase() };
  return { tree, truncated };
}

export interface AutoSessionInit {
  projectDir: string;
  baseURL?: string;
  startUrl?: string;
  blocksSelect?: import("./blocks-select.js").BlocksSelect;
  /** Absolute paths — merged Block libraries (see `waygraph browser --inject`). */
  inject?: string[];
  /** When true, open about:blank instead of baseURL/startUrl (browser default). */
  skipInitialNavigation?: boolean;
  /** Default true. false launches a real visible browser window. */
  headless?: boolean;
  /**
   * Shown on the on-page Pilot overlay badge, when known - purely cosmetic,
   * this class has no other use for it. `auto --cli --detach`'s spawned
   * child (`runAutoServeCommand`) always knows and passes its own generated
   * id; a directly-constructed `AutoSession` (e.g. in a test) simply omits
   * it, and the badge shows "no session id" instead.
   */
  sessionId?: string;
}

export type ApplyPickResult =
  | { ok: true; snapshot: SessionSnapshot; quit: boolean }
  | { ok: false; error: string };

export type ApplyPathResult =
  | { ok: true; path: string[]; snapshot: SessionSnapshot }
  | { ok: false; error: string };

/**
 * One Checkpoint/Block-level step in a session's history - not a raw action
 * recording (no clicks/fills). Kept lean by design: an agent that wants DOM
 * evidence at a specific step already has `inspectDom` to call itself.
 */
export interface TraceStep {
  block: string;
  from: string | null;
  to?: string;
  error?: string;
  timestamp: string;
  /**
   * Resolved demo-narration fixtures (highlights/todos/device), when the
   * Block actually authors `stubBefore`/`stubAfter`/`stubOnError` - the same
   * data `waygraph demo`'s lifecycle logging already computes (`runStubPhase`
   * in highlights.ts), reused here for extra context on what a step meant to
   * convey. Omitted when the Block has none, or the result carries nothing.
   */
  stubBefore?: StubPhaseResult;
  stubAfter?: StubPhaseResult;
  stubOnError?: StubPhaseResult;
}

const TRACE_MAX_STEPS = 500;

export type StubFileKind = "image" | "pdf" | "video";

/**
 * Real, minimal, valid fixture files bundled at `assets/stubs/` - not
 * placeholder/renamed-empty files: `stub.png` is a real 1x1 PNG,
 * `stub.pdf` a real single-page PDF, `stub.mp4` a real ffmpeg-encoded
 * 1s black clip. Real, direct user request: Blind Pilot hitting a real
 * `<input type="file">` (e.g. an avatar upload) had no way to supply
 * anything without a human handing over a real file each time - these are
 * small enough to ship in the package and pass most apps' basic file-type
 * checks (magic bytes, not just extension).
 */
/**
 * Public so a Block a consumer writes can reach the same real fixture files
 * `rawUpload` uses - not just the raw primitive. Needed when a real upload
 * flow has no stable `<input type="file">` to hand a selector to at all
 * (e.g. one created on the fly inside a click handler, then immediately
 * `.click()`'d to open the OS picker and possibly torn down right after) -
 * a Block's own `act()` should pair this with `page.waitForEvent("filechooser")`
 * around the triggering click, not go hunting for a selector that may not
 * exist for more than a moment.
 */
export function stubFilePath(kind: StubFileKind): string {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const names: Record<StubFileKind, string> = {
    image: "stub.png",
    pdf: "stub.pdf",
    video: "stub.mp4",
  };
  return join(packageRoot, "assets", "stubs", names[kind]);
}

/**
 * Real gap found live (Blind Pilot against veciro.com): a form submit that
 * does nothing observable in the DOM - no navigation, no visible error text -
 * is undiagnosable through `inspectDom` alone, since a silent client-side
 * validation failure or a failed network request never touches the DOM at
 * all. `auto dom` reads what's rendered; this reads what the page/network
 * actually SAID, independent of whether the app chose to show it.
 */
export interface ConsoleLogEntry {
  type: "console" | "pageerror" | "response";
  level?: string;
  text: string;
  url?: string;
  status?: number;
  timestamp: string;
}

const CONSOLE_LOG_MAX_ENTRIES = 200;

export interface ServiceWorkerRegistrationInfo {
  scope: string;
  activeUrl?: string;
  state?: string;
}

export interface CookieInfo {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
}

export interface StorageSnapshot {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  cookies: CookieInfo[];
  serviceWorkers: string[];
  serviceWorkerRegistrations: ServiceWorkerRegistrationInfo[];
}

/**
 * Non-interactive explore session: same graph/library/mem/browser setup
 * `runAutoExplore` runs in `--cli` mode, driven by `applyPick` instead of a
 * blocking `readline` loop. Headless by default (matching
 * `runAutoExplore`'s own `cli` branch), optionally visible via
 * `AutoSessionInit.headless: false` - this type only ever backs the `--cli`
 * picker, never the headful page-embedded panel, headless or not.
 */
export class AutoSession {
  private here: string | null = null;
  private lastRunNote: string | null = null;
  private readonly trace: TraceStep[] = [];
  private readonly consoleLog: ConsoleLogEntry[] = [];
  private readonly knownInteractionSelectors: string[];
  private readonly headless: boolean;
  private lastOverlayInfo: PilotOverlayInfo | null = null;

  private constructor(
    private readonly projectDir: string,
    private readonly inject: string[] | undefined,
    private readonly blocksSelect: import("./blocks-select.js").BlocksSelect | undefined,
    private graph: Awaited<ReturnType<typeof buildExploreContext>>["graph"],
    private library: Awaited<ReturnType<typeof buildExploreContext>>["library"],
    private readonly mem: MemPage,
    private readonly engine: Engine,
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    private page: Page,
    private readonly startUrl: string | undefined,
    private readonly sessionId: string | undefined,
    knownInteractionSelectors: string[],
    headless: boolean,
  ) {
    this.knownInteractionSelectors = knownInteractionSelectors;
    this.headless = headless;
  }

  static async start(init: AutoSessionInit): Promise<AutoSession> {
    const baseURL = init.baseURL ?? resolveBaseUrl(init.projectDir);
    const skipNav = init.skipInitialNavigation === true;
    const startUrl = skipNav ? undefined : (init.startUrl ?? baseURL);
    const exploreOpts = {
      ...(init.blocksSelect ? { blocksSelect: init.blocksSelect } : {}),
      ...(init.inject?.length ? { inject: init.inject } : {}),
    };
    const { graph, library } = await buildExploreContext(
      init.projectDir,
      Object.keys(exploreOpts).length ? exploreOpts : undefined,
    );
    const mem = new MemPage();
    seedDefaultMem(library.byName, mem);
    const headless = init.headless ?? true;
    const engine = new Engine({ headless });
    const { chromium } = await import("@playwright/test");
    const executablePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
    // Real gap found live: a headed (--non-headless) session kept a fixed
    // 1280x720 content area even when the user maximized/fullscreened the
    // actual window - `viewport: null` alone only makes the PAGE track the
    // window; the window itself still launches at Chromium's own small
    // default size unless told to start maximized. Same fix cli.ts's own
    // --step/headed launch already uses (see its own comment there) -
    // headless keeps the fixed viewport since there's no real window to size.
    const launchOpts: Parameters<typeof chromium.launch>[0] = {
      headless,
      // Keep Playwright's default --no-startup-window for headful: without it
      // Chromium opens its own "New Tab" window AND our context.newPage() opens
      // a second about:blank window. bringToFront() below surfaces the real page.
      args: headless ? [] : ["--start-maximized"],
    };
    if (executablePath) launchOpts.executablePath = executablePath;
    const browser = await chromium.launch(launchOpts);
    const contextOpts: Parameters<typeof browser.newContext>[0] = {
      viewport: headless ? { width: 1280, height: 720 } : null,
    };
    if (baseURL) contextOpts.baseURL = baseURL;
    const context = await browser.newContext(contextOpts);
    await installPersistentPilotOverlay(context);
    const page = await context.newPage();
    if (startUrl) {
      await page.goto(startUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForLoadState("load").catch(() => {});
    } else {
      await page.goto("about:blank").catch(() => {});
    }
    const knownInteractionSelectors = collectKnownInteractionSelectors(
      init.projectDir,
      library,
      init.inject,
    );
    const session = new AutoSession(
      init.projectDir,
      init.inject,
      init.blocksSelect,
      graph,
      library,
      mem,
      engine,
      browser,
      context,
      page,
      startUrl,
      init.sessionId,
      knownInteractionSelectors,
      headless,
    );
    page.on("load", () => {
      void session.repaintOverlayAfterNavigation();
    });
    if (!headless) {
      await session.bootstrapOverlay().catch(() => {});
      await page.bringToFront().catch(() => {});
    }
    // Attached once, on the page created here - `ensureLivePage` only swaps
    // to a fresh Page if the current one closed (a rare case, e.g. the human
    // closing the tab), not on ordinary same-page SPA navigation, which is
    // all this target (and most real sites) actually do.
    page.on("console", (msg) => {
      session.pushConsoleLog({
        type: "console",
        level: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString(),
      });
    });
    page.on("pageerror", (err) => {
      session.pushConsoleLog({
        type: "pageerror",
        text: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
    });
    page.on("response", (res) => {
      // Every failed response (the original case), PLUS every mutation
      // (non-GET) response regardless of status - a real gap found live:
      // "auto console" only logging failures made a SUCCESSFUL POST that
      // simply didn't navigate anywhere look identical to "nothing
      // happened at all," undiagnosable the same way a real failure was.
      // A mutation's outcome (2xx or not) is always diagnostically
      // relevant; a GET's usually isn't (assets, trackers) unless it failed.
      const method = res.request().method();
      if (res.status() < 400 && method === "GET") return;
      session.pushConsoleLog({
        type: "response",
        text: `${method} ${res.statusText()}`,
        url: res.url(),
        status: res.status(),
        timestamp: new Date().toISOString(),
      });
    });
    return session;
  }

  /** Pure getter - returns a copy, not the live array. */
  getTrace(): TraceStep[] {
    return [...this.trace];
  }

  private pushTrace(step: TraceStep): void {
    this.trace.push(step);
    if (this.trace.length > TRACE_MAX_STEPS) this.trace.shift();
  }

  /** Pure getter - returns a copy, not the live array. */
  getConsoleLog(): ConsoleLogEntry[] {
    return [...this.consoleLog];
  }

  private pushConsoleLog(entry: ConsoleLogEntry): void {
    this.consoleLog.push(entry);
    if (this.consoleLog.length > CONSOLE_LOG_MAX_ENTRIES) this.consoleLog.shift();
  }

  private async currentMenu(): Promise<ExploreMenu> {
    this.page = await ensureLivePage(this.context, this.page, this.startUrl);
    if (this.here === null) {
      this.here = await detectHere(this.page, this.library.navBlocks);
    }
    const menu = await buildExploreMenu(this.page, this.graph, this.library, this.here);
    // Every caller of currentMenu() (status reads, applyPick/applyPath,
    // the raw click/type/goto primitives, resync) already routes through
    // here, so hooking the overlay refresh at this one point covers every
    // real state-changing (and reading) path without needing a separate
    // call at each site. Awaited deliberately, not fire-and-forget - the
    // whole point is a human watching the screen sees the SAME state a
    // concurrent API caller just got back, not a stale frame that catches
    // up moments later.
    this.lastOverlayInfo = {
      sessionId: this.sessionId,
      snapshot: buildSessionSnapshot(menu, this.library.byName, this.here, this.lastRunNote),
      graph: this.graph,
    };
    await updatePilotOverlay(this.page, this.lastOverlayInfo);
    await this.warnUnmappedInteractions();
    return menu;
  }

  /** Paint the overlay on about:blank / immediately after session start (headful browser). */
  private async bootstrapOverlay(): Promise<void> {
    await this.currentMenu();
  }

  /** Re-apply cached overlay state after navigation (init script restores shell only). */
  private async repaintOverlayAfterNavigation(): Promise<void> {
    if (this.lastOverlayInfo) {
      await updatePilotOverlay(this.page, this.lastOverlayInfo).catch(() => {});
      return;
    }
    if (!this.headless) {
      await this.bootstrapOverlay().catch(() => {});
    }
  }

  /**
   * Flags same-origin `<a href>` paths and visible buttons with no NavBlock
   * URL / Block selector in the loaded library — read via `auto console`.
   * Deduped per page load so repeated status/send calls stay quiet.
   */
  private async warnUnmappedInteractions(): Promise<void> {
    const knownPathnames: string[] = [];
    for (const entry of this.library.navBlocks) {
      const url = (entry.block as unknown as { __waygraphNavUrl?: string }).__waygraphNavUrl;
      if (!url) continue;
      try {
        knownPathnames.push(new URL(url, this.page.url()).pathname);
      } catch {
        /* not a resolvable URL (relative to an unset base, etc.) - skip */
      }
    }
    const payload: UnmappedInteractionPayload = {
      knownPathnames,
      knownSelectors: this.knownInteractionSelectors,
    };
    await this.page.evaluate(unmappedInteractionsPageScript, payload).catch(() => {});
  }

  /** Pure getter - no Block runs, no mem/page mutation. */
  async currentSnapshot(): Promise<SessionSnapshot> {
    const menu = await this.currentMenu();
    return buildSessionSnapshot(menu, this.library.byName, this.here, this.lastRunNote);
  }

  /**
   * Pure getter - reads the live page's structure at the requested fidelity.
   * No Block runs, no mem/page mutation. `selector` scopes either mode to one
   * element's subtree; it is a modifier, not a third mode.
   */
  async inspectDom(opts: InspectDomOptions): Promise<InspectDomResult> {
    this.page = await ensureLivePage(this.context, this.page, this.startUrl);
    const mode = opts.mode ?? "aria";
    const ariaOptions = opts.depth !== undefined ? { mode: "ai" as const, depth: opts.depth } : { mode: "ai" as const };

    if (opts.selector) {
      const locator = this.page.locator(opts.selector).first();
      if ((await locator.count()) === 0) {
        return { ok: false, error: `no element matches selector "${opts.selector}"` };
      }
      await showPilotVision(this.page, opts.selector, `dom (${mode}): ${opts.selector}`, "orange");
      if (mode === "full") {
        const caps: FullDomCaps = {
          depth: opts.depth ?? FULL_MODE_DEFAULT_DEPTH,
          maxNodes: FULL_MODE_MAX_NODES,
          maxTextLength: FULL_MODE_MAX_TEXT_LENGTH,
        };
        const { tree, truncated } = await locator.evaluate(walkFullDom, caps);
        return { ok: true, snapshot: { mode: "full", selector: opts.selector, truncated, tree } };
      }
      const tree = await locator.ariaSnapshotJSON(ariaOptions);
      return { ok: true, snapshot: { mode: "aria", selector: opts.selector, truncated: false, tree } };
    }

    await showPilotActivity(this.page, `Running (Dom): ${mode}, whole page`);
    if (mode === "full") {
      // page.evaluate only ships the one function passed to it - it can't
      // reach another named function by closure. Routing the whole-page case
      // through the same `html` Locator lets both cases share one
      // self-contained walkFullDom instead of two near-duplicate callbacks.
      const caps: FullDomCaps = {
        depth: opts.depth ?? FULL_MODE_DEFAULT_DEPTH,
        maxNodes: FULL_MODE_MAX_NODES,
        maxTextLength: FULL_MODE_MAX_TEXT_LENGTH,
      };
      const { tree, truncated } = await this.page.locator("html").first().evaluate(walkFullDom, caps);
      return { ok: true, snapshot: { mode: "full", truncated, tree } };
    }
    const tree = await this.page.ariaSnapshotJSON(ariaOptions);
    return { ok: true, snapshot: { mode: "aria", truncated: false, tree } };
  }

  /**
   * Pure getter - reads the live page's client-side state: localStorage,
   * sessionStorage, and registered service workers (scope/active URL/state).
   * Real, direct follow-up to `auto console`'s own gap: a site doing web
   * push (this target has a real `NOTIFICATION_VAPID` config, confirmed via
   * `auto dom` earlier) keeps push-subscription/auth state in these places,
   * not in the rendered DOM `inspectDom` reads.
   */
  async inspectStorage(): Promise<StorageSnapshot> {
    this.page = await ensureLivePage(this.context, this.page, this.startUrl);
    const [localStorageEntries, sessionStorageEntries] = await this.page.evaluate(() => [
      Object.entries(window.localStorage),
      Object.entries(window.sessionStorage),
    ]);
    const cookies = await this.context.cookies();
    const workers = this.context.serviceWorkers();
    const registrations = await this.page
      .evaluate(async () => {
        if (!("serviceWorker" in navigator)) return [];
        const regs = await navigator.serviceWorker.getRegistrations();
        return regs.map((r) => ({
          scope: r.scope,
          ...(r.active?.scriptURL ? { activeUrl: r.active.scriptURL } : {}),
          ...(r.active?.state ? { state: r.active.state } : {}),
        }));
      })
      .catch(() => []);
    return {
      localStorage: Object.fromEntries(localStorageEntries),
      sessionStorage: Object.fromEntries(sessionStorageEntries),
      cookies: cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        httpOnly: c.httpOnly,
        secure: c.secure,
      })),
      serviceWorkers: workers.map((w) => w.url()),
      serviceWorkerRegistrations: registrations,
    };
  }

  /**
   * Runs one already-resolved Block entry for real - the shared core both
   * `applyPick` (resolved via a live-menu index) and `applyPath` (resolved
   * directly by name, bypassing live-menu-visibility entirely - see
   * `applyPath`'s own comment for why) call. `expectedTo` is only used as a
   * fallback when a Block's own `resolve()` doesn't set `__state` - same
   * behavior `applyPick` always had, just factored out, not changed.
   */
  private async runNamedBlock(
    entry: BlockEntry,
    expectedTo: string,
    instanceOption?: WaygraphInstanceOption,
  ): Promise<ApplyPickResult> {
    const from = this.here;
    const stubBeforeResult = await runStubPhase(entry.block, "stubBefore");
    const stepBase: Pick<TraceStep, "block" | "from" | "timestamp" | "stubBefore"> = {
      block: entry.block.name,
      from,
      timestamp: new Date().toISOString(),
      ...(stubPhaseHasContent(stubBeforeResult) ? { stubBefore: stubBeforeResult } : {}),
    };
    try {
      if (instanceOption) {
        this.mem.set(instanceOption.key, instanceOption.value);
      }
      // Always the non-interactive path (cli: false) - a detached session has
      // no TTY to prompt on; a missing mem key fails loud instead of hanging.
      await ensureMem(entry, this.mem, false);
      const result = await runOneBlock(this.engine, entry, this.context, this.page, this.mem, false);
      this.here = (result as Checkpoint<string>).__state ?? expectedTo;
      this.lastRunNote = `${entry.block.name} -> ${this.here}`;
      const stubAfterResult = await runStubPhase(entry.block, "stubAfter", { out: result });
      this.pushTrace({
        ...stepBase,
        to: this.here,
        ...(stubPhaseHasContent(stubAfterResult) ? { stubAfter: stubAfterResult } : {}),
      });
    } catch (err) {
      this.lastRunNote = `${entry.block.name} failed`;
      const message = err instanceof Error ? err.message : String(err);
      const stubOnErrorResult = await runStubPhase(entry.block, "stubOnError", { error: err });
      this.pushTrace({
        ...stepBase,
        error: message,
        ...(stubPhaseHasContent(stubOnErrorResult) ? { stubOnError: stubOnErrorResult } : {}),
      });
      return { ok: false, error: `${entry.block.name} failed - ${message}` };
    }

    const nextMenu = await this.currentMenu();
    return {
      ok: true,
      snapshot: buildSessionSnapshot(nextMenu, this.library.byName, this.here, this.lastRunNote),
      quit: false,
    };
  }

  /** Applies exactly one pick: runs at most one Block, returns the resulting state. */
  async applyPick(raw: string): Promise<ApplyPickResult> {
    const menu = await this.currentMenu();
    const pick = parsePick(raw, menu.flat.length);
    if (pick.type === "invalid") return { ok: false, error: pick.reason };
    if (pick.type === "quit") {
      return {
        ok: true,
        snapshot: buildSessionSnapshot(menu, this.library.byName, this.here, this.lastRunNote),
        quit: true,
      };
    }

    const edge = menu.flat[pick.index]!;
    const entry = this.library.byName.get(edge.block);
    if (!entry) {
      return { ok: false, error: `Block "${edge.block}" not loaded - skipped` };
    }
    await showPilotActivity(this.page, `Running (Block): ${edge.block}`);
    return this.runNamedBlock(entry, edge.to, edge.instanceOption);
  }

  /**
   * Re-discovers the project's Block library and graph from disk, using the
   * exact same call `start()` itself makes - not a duplicated read - and
   * replaces `this.library`/`this.graph` in place. Leaves the live page,
   * mem, browser/context, and current Checkpoint (`here`) untouched, so a
   * Block written to disk mid-session becomes pickable via a later
   * `applyPick` without restarting the session. See
   * openspec/changes/waygraph-blind-pilot/design.md.
   */
  async reloadLibrary(): Promise<void> {
    if (this.page) await showPilotActivity(this.page, "Running: reload");
    const exploreOpts = {
      ...(this.blocksSelect ? { blocksSelect: this.blocksSelect } : {}),
      ...(this.inject?.length ? { inject: this.inject } : {}),
    };
    const { graph, library } = await buildExploreContext(
      this.projectDir,
      Object.keys(exploreOpts).length ? exploreOpts : undefined,
    );
    this.graph = graph;
    this.library = library;
    if (this.page) await showPilotActivity(this.page, "Map updated");
  }

  /**
   * Forces `here` to be re-detected from the real live page, discarding
   * whatever was cached - the fix for a real, confirmed gap: `here` is only
   * ever updated by an action this class itself ran (`applyPick`/`applyPath`
   * set it to a Block's own resolved Checkpoint; `rawClick`/`rawType`/
   * `rawGoto` reset it to `null` because *they* just changed the page). If a
   * human co-driving the same visible session clicks/types/navigates
   * directly - a real scenario for a headful Pilot session someone is
   * watching, not hypothetical - none of that goes through this class at
   * all, so `here` silently goes stale: `currentMenu()`'s own lazy check
   * (`if (this.here === null)`, just above) only re-detects when `here` is
   * already unknown, never to confirm a *known* value is still correct.
   * This does not crash the session (the process/socket/page all stay
   * alive) but subsequent `send`/`reach` calls would act on a menu built
   * from the wrong Checkpoint until something forces re-detection - this
   * method is that: unconditionally re-run the same `detectHere` logic the
   * lazy path already uses, regardless of what `here` currently holds.
   */
  async resync(): Promise<ApplyPickResult> {
    this.page = await ensureLivePage(this.context, this.page, this.startUrl);
    await showPilotActivity(this.page, "Running: resync");
    this.here = await detectHere(this.page, this.library.navBlocks);
    const menu = await this.currentMenu();
    this.lastRunNote = `resync -> ${this.here ?? "Unknown"}`;
    return {
      ok: true,
      snapshot: buildSessionSnapshot(menu, this.library.byName, this.here, this.lastRunNote),
      quit: false,
    };
  }

  /**
   * Raw interaction primitives for a page no Block covers yet (Blind Pilot -
   * see openspec/changes/waygraph-blind-pilot). Unlike `applyPick`, the
   * resulting Checkpoint isn't known ahead of time from a Block's own
   * `resolve()`, so each of these invalidates the cached `here` (forcing
   * `currentMenu()`'s existing lazy `detectHere` call to run again) rather
   * than assuming the page didn't move anywhere a Block now recognizes.
   * A selector matching nothing is a reported failure, not a silent no-op.
   */
  async rawClick(selector: string): Promise<ApplyPickResult> {
    this.page = await ensureLivePage(this.context, this.page, this.startUrl);
    await showPilotActivity(this.page, `Running (no Block): click "${selector}"`);
    const locator = this.page.locator(selector).first();
    if ((await locator.count()) === 0) {
      return { ok: false, error: `no element matches selector "${selector}"` };
    }
    await showPilotVision(this.page, selector, `click: ${selector}`);
    await locator.click();
    this.here = null;
    const menu = await this.currentMenu();
    this.lastRunNote = `click "${selector}" -> ${this.here ?? "Unknown"}`;
    return {
      ok: true,
      snapshot: buildSessionSnapshot(menu, this.library.byName, this.here, this.lastRunNote),
      quit: false,
    };
  }

  async rawType(selector: string, text: string): Promise<ApplyPickResult> {
    this.page = await ensureLivePage(this.context, this.page, this.startUrl);
    await showPilotActivity(this.page, `Running (no Block): type into "${selector}"`);
    const locator = this.page.locator(selector).first();
    if ((await locator.count()) === 0) {
      return { ok: false, error: `no element matches selector "${selector}"` };
    }
    await showPilotVision(this.page, selector, `type: ${selector}`);
    await locator.fill(text);
    this.here = null;
    const menu = await this.currentMenu();
    this.lastRunNote = `type into "${selector}" -> ${this.here ?? "Unknown"}`;
    return {
      ok: true,
      snapshot: buildSessionSnapshot(menu, this.library.byName, this.here, this.lastRunNote),
      quit: false,
    };
  }

  /**
   * Presses a real key on a real focused element - a real gap found live:
   * many real inline-edit inputs (no visible Save button at all) commit on
   * Enter, not on blur/click-elsewhere. `key` is a Playwright key name
   * (e.g. "Enter", "Escape", "Tab") - same vocabulary as
   * `page.keyboard.press`, which this wraps.
   */
  async rawPress(selector: string, key: string): Promise<ApplyPickResult> {
    this.page = await ensureLivePage(this.context, this.page, this.startUrl);
    await showPilotActivity(this.page, `Running (no Block): press "${key}" on "${selector}"`);
    const locator = this.page.locator(selector).first();
    if ((await locator.count()) === 0) {
      return { ok: false, error: `no element matches selector "${selector}"` };
    }
    await showPilotVision(this.page, selector, `press ${key}: ${selector}`);
    await locator.press(key);
    this.here = null;
    const menu = await this.currentMenu();
    this.lastRunNote = `press "${key}" on "${selector}" -> ${this.here ?? "Unknown"}`;
    return {
      ok: true,
      snapshot: buildSessionSnapshot(menu, this.library.byName, this.here, this.lastRunNote),
      quit: false,
    };
  }

  async rawGoto(url: string): Promise<ApplyPickResult> {
    this.page = await ensureLivePage(this.context, this.page, this.startUrl);
    await showPilotActivity(this.page, `Running (no Block): goto "${url}"`);
    try {
      await this.page.goto(url, { waitUntil: "domcontentloaded" });
    } catch (err) {
      return { ok: false, error: `goto "${url}" failed - ${err instanceof Error ? err.message : String(err)}` };
    }
    this.here = null;
    const menu = await this.currentMenu();
    this.lastRunNote = `goto "${url}" -> ${this.here ?? "Unknown"}`;
    return {
      ok: true,
      snapshot: buildSessionSnapshot(menu, this.library.byName, this.here, this.lastRunNote),
      quit: false,
    };
  }

  /**
   * Fills a real `<input type="file">` - a built-in stub kind
   * ("image"/"pdf"/"video", see `stubFilePath`) or a caller-supplied
   * `filePath` for anything else ("whatever", per the real request this
   * responds to). Same raw-primitive shape as click/type/goto: works with
   * zero Blocks, invalidates `here` since the app may react to the upload.
   */
  async rawUpload(selector: string, stub: StubFileKind | { filePath: string }): Promise<ApplyPickResult> {
    this.page = await ensureLivePage(this.context, this.page, this.startUrl);
    const filePath = typeof stub === "string" ? stubFilePath(stub) : stub.filePath;
    const label = typeof stub === "string" ? stub : filePath;
    await showPilotActivity(this.page, `Running (no Block): upload ${label} into "${selector}"`);
    const locator = this.page.locator(selector).first();
    if ((await locator.count()) === 0) {
      return { ok: false, error: `no element matches selector "${selector}"` };
    }
    await showPilotVision(this.page, selector, `upload ${label}: ${selector}`);
    try {
      await locator.setInputFiles(filePath);
    } catch (err) {
      return { ok: false, error: `upload into "${selector}" failed - ${err instanceof Error ? err.message : String(err)}` };
    }
    this.here = null;
    const menu = await this.currentMenu();
    this.lastRunNote = `upload ${label} into "${selector}" -> ${this.here ?? "Unknown"}`;
    return {
      ok: true,
      snapshot: buildSessionSnapshot(menu, this.library.byName, this.here, this.lastRunNote),
      quit: false,
    };
  }

  /**
   * Agent-sent highlight fixtures (rings + optional todos) on the live page -
   * the Pilot equivalent of Block `stubBefore` narration in `waygraph demo`.
   * Does not run a Block; paint-only. Missing selectors are reported, not fatal.
   */
  async applyHighlight(
    fixtures: PilotHighlightFixtures,
  ): Promise<
    | { ok: true; painted: number; missing: string[]; snapshot: SessionSnapshot }
    | { ok: false; error: string }
  > {
    this.page = await ensureLivePage(this.context, this.page, this.startUrl);
    const detail =
      fixtures.clear === true
        ? "clear"
        : [
            fixtures.rings?.length ? `${fixtures.rings.length} ring(s)` : null,
            fixtures.todos?.length ? `${fixtures.todos.length} todo(s)` : null,
            fixtures.zoom && fixtures.zoom > 1.001 ? `zoom ${fixtures.zoom}` : null,
            fixtures.device
              ? `device ${typeof fixtures.device === "string" ? fixtures.device : fixtures.device.preset || "custom"}`
              : null,
            fixtures.rings?.some((r) => r.focus) ? "focus" : null,
          ]
            .filter(Boolean)
            .join(", ") || "fixtures";
    // Same bottom-left activity toast as Running (Dom)/(Block) - agent narration.
    await showPilotActivity(this.page, `Highlighting: ${detail}`);
    try {
      const { painted, missing } = await showPilotFixtures(this.page, fixtures);
      const menu = await this.currentMenu();
      this.lastRunNote = fixtures.clear
        ? "highlight cleared"
        : `highlight painted ${painted}` +
          (missing.length ? ` (missing: ${missing.join(", ")})` : "");
      return {
        ok: true,
        painted,
        missing,
        snapshot: buildSessionSnapshot(menu, this.library.byName, this.here, this.lastRunNote),
      };
    } catch (err) {
      return {
        ok: false,
        error: `highlight failed - ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Runs a whole multi-step route to `targetCheckpoint` in one call, instead
   * of an agent hand-picking one index at a time across many separate
   * `applyPick` round trips - real, reported pain for any non-trivial task
   * on a rich graph ("the entire prompts of the day" driving one step per
   * call).
   *
   * Two other designs were tried and rejected by direct reproduction against
   * live saucedemo.com before this one, both undone by the same root cause:
   * a `from: "*"` edge (e.g. "Checkout", only clickable once you're actually
   * on the cart page with items) looks globally reachable to
   * `findBlockPath`'s static-graph BFS, which has no live-page access and
   * can't know the edge's real precondition isn't showing yet. Computing the
   * whole route once upfront names a premature wildcard step immediately;
   * scoring each live menu option by its static-graph distance to the
   * target (greedy best-first) doesn't fix it either - a harmless self-loop
   * Method can score just as well as real progress once wildcard "shortcuts"
   * are baked into every distance calculation, and the session gets stuck
   * repeating it.
   *
   * The fix that actually works: stop trying to be clever about live-menu
   * visibility per step, and reuse `auto --blocks <From> <To>`'s own already
   * -proven approach instead - compute the path ONCE (via
   * `findBlockPathDetailed`, the same BFS `findBlockPath`/`runChainAuto`
   * already use, extended to also return each hop's specific edge - see its
   * own doc comment for why that extra detail is load-bearing, not cosmetic),
   * then run each Block in it directly via `runNamedBlock`, trusting the
   * graph the same way `runChain`'s own flow execution already does, not
   * gated on live-menu visibility at all. The one real difference from
   * `runChainAuto`: this runs against the session's own already-live
   * page/context/mem, not a freshly spawned browser - the whole point of
   * staying in one session. A step whose real precondition genuinely isn't
   * met still fails loud, naming that step, exactly the way a mis-ordered
   * `runChain` spec would - and a step that runs without throwing but lands
   * somewhere other than what its own edge promised (a real, observed case,
   * not hypothetical - see this method's own test suite) fails loud too,
   * rather than reporting false success.
   */
  async applyPath(targetCheckpoint: string): Promise<ApplyPathResult> {
    await this.currentMenu();
    const from = this.here;
    if (from === null) {
      return { ok: false, error: "cannot path-find: the session's current Checkpoint is unknown (here is null)" };
    }
    const path = findBlockPathDetailed(this.graph, from, targetCheckpoint);
    if (!path) {
      return { ok: false, error: `no Block path from "${from}" to "${targetCheckpoint}" in the discovered graph` };
    }
    for (const step of path) {
      const entry = this.library.byName.get(step.block);
      if (!entry) {
        return { ok: false, error: `path step "${step.block}" is in the discovered graph but not loaded in this session's library` };
      }
      if (entry.block.instanceOptions) {
        return {
          ok: false,
          error: `path step "${step.block}" needs a specific live option chosen (an instanceOptions Block, e.g. one per product) - ambiguous for automatic routing, use applyPick directly with the specific index`,
        };
      }
      if (this.page) await showPilotActivity(this.page, `Running (Block): ${step.block} (reach -> ${targetCheckpoint})`);
      const result = await this.runNamedBlock(entry, step.to);
      if (!result.ok) {
        return { ok: false, error: `step "${step.block}" failed - ${result.error}` };
      }
      // A Block can resolve to a DIFFERENT real Checkpoint than this exact
      // hop's own edge expected, without throwing at all - e.g.
      // submit-login's own resolve() legitimately "stays on LoginPage" on
      // bad auth instead of erroring. Trusting `result.ok` alone would
      // silently report success while sitting on the wrong page - a real
      // bug caught by this method's own test suite, not theoretical.
      // `step.to` (not a name-based re-lookup - a union-Out Block can have
      // several edges sharing one name with different `to` tags) is exactly
      // the Checkpoint THIS hop's own edge in the computed route promised.
      if (this.here !== step.to) {
        return {
          ok: false,
          error: `step "${step.block}" ran but landed on "${this.here}", not the expected "${step.to}" - it did not throw, but did not make the expected progress either`,
        };
      }
    }
    return { ok: true, path: path.map((s) => s.block), snapshot: await this.currentSnapshot() };
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }
}
