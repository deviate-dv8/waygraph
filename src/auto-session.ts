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
import { Engine, MemPage } from "./index.js";
import type { Checkpoint } from "./types.js";
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
  /** Default true. false launches a real visible browser window. */
  headless?: boolean;
}

export type ApplyPickResult =
  | { ok: true; snapshot: SessionSnapshot; quit: boolean }
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

  private constructor(
    private readonly graph: Awaited<ReturnType<typeof buildExploreContext>>["graph"],
    private readonly library: Awaited<ReturnType<typeof buildExploreContext>>["library"],
    private readonly mem: MemPage,
    private readonly engine: Engine,
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    private page: Page,
    private readonly startUrl: string | undefined,
  ) {}

  static async start(init: AutoSessionInit): Promise<AutoSession> {
    const baseURL = init.baseURL ?? resolveBaseUrl(init.projectDir);
    const startUrl = init.startUrl ?? baseURL;
    const { graph, library } = await buildExploreContext(
      init.projectDir,
      init.blocksSelect ? { blocksSelect: init.blocksSelect } : undefined,
    );
    const mem = new MemPage();
    seedDefaultMem(library.byName, mem);
    const headless = init.headless ?? true;
    const engine = new Engine({ headless });
    const { chromium } = await import("@playwright/test");
    const executablePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
    const launchOpts: Parameters<typeof chromium.launch>[0] = { headless, args: [] };
    if (executablePath) launchOpts.executablePath = executablePath;
    const browser = await chromium.launch(launchOpts);
    const contextOpts: Parameters<typeof browser.newContext>[0] = {
      viewport: { width: 1280, height: 720 },
    };
    if (baseURL) contextOpts.baseURL = baseURL;
    const context = await browser.newContext(contextOpts);
    const page = await context.newPage();
    if (startUrl) {
      await page.goto(startUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForLoadState("load").catch(() => {});
    }
    return new AutoSession(graph, library, mem, engine, browser, context, page, startUrl);
  }

  /** Pure getter - returns a copy, not the live array. */
  getTrace(): TraceStep[] {
    return [...this.trace];
  }

  private pushTrace(step: TraceStep): void {
    this.trace.push(step);
    if (this.trace.length > TRACE_MAX_STEPS) this.trace.shift();
  }

  private async currentMenu(): Promise<ExploreMenu> {
    this.page = await ensureLivePage(this.context, this.page, this.startUrl);
    if (this.here === null) {
      this.here = await detectHere(this.page, this.library.navBlocks);
    }
    return buildExploreMenu(this.page, this.graph, this.library, this.here);
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

    const from = this.here;
    const stubBeforeResult = await runStubPhase(entry.block, "stubBefore");
    const stepBase: Pick<TraceStep, "block" | "from" | "timestamp" | "stubBefore"> = {
      block: entry.block.name,
      from,
      timestamp: new Date().toISOString(),
      ...(stubPhaseHasContent(stubBeforeResult) ? { stubBefore: stubBeforeResult } : {}),
    };
    try {
      if (edge.instanceOption) {
        this.mem.set(edge.instanceOption.key, edge.instanceOption.value);
      }
      // Always the non-interactive path (cli: false) - a detached session has
      // no TTY to prompt on; a missing mem key fails loud instead of hanging.
      await ensureMem(entry, this.mem, false);
      const result = await runOneBlock(this.engine, entry, this.context, this.page, this.mem, false);
      this.here = (result as Checkpoint<string>).__state ?? edge.to;
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

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }
}
