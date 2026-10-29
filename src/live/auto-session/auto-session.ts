// AutoSession: one live browser session driven over IPC - its menu, picks, routes, raw actions and highlights.
import { setStepData, type MemSource } from "./session-mem.js";
import { messageOf } from "../../engine/errors.js";
import type { BrowserContext, Page } from "@playwright/test";
import type { UnmappedInteractionPayload } from "../../analysis/coverage-gap.js";
import type { ListPick } from "./read.js";
import { collectKnownInteractionSelectors, knownNavPathnames, unmappedInteractionsPageScript } from "../../analysis/coverage-gap.js";
import { findBlockPathDetailed } from "../../analysis/graph.js";
import { runStubPhase } from "../../demo/narration/narration.js";
import { describeOverlayFixtures, phaseToOverlayFixtures } from "../../demo/overlay/phase-fixtures.js";
import type { PilotHighlightFixtures } from "../../demo/overlay/pilot/fixtures.js";
import { showPilotFixtures } from "../../demo/overlay/pilot/fixtures.js";
import { showPilotActivity } from "../../demo/overlay/pilot/shell.js";
import { keepOverlayOnNavigation } from "../../demo/overlay/reattach.js";
import { verboseLog } from "../../demo/verbose-log.js";
import type { WaygraphInstanceOption } from "../../engine/block/action-page.js";
import type { Checkpoint } from "../../engine/checkpoint/checkpoint.js";
import { Engine } from "../../engine/engine.js";
import { MemPage } from "../../engine/mem/mem.js";
import { ignorePageGone } from "../../engine/page-gone.js";
import type { BlockEntry } from "../../manifest/project.js";
import { resolveBaseUrl } from "../../runtime/waygraph-config.js";
import { detectHere, ensureLivePage, runOneBlock } from "../auto/auto.js";
import type { ExploreMenu } from "../auto/explore.js";
import { buildExploreContext, buildExploreMenu } from "../auto/explore.js";
import { ensureMem, optionChosen, seedDefaultMem } from "../auto/mem.js";
import type { PilotOverlayInfo } from "../pilot/panel.js";
import { updatePilotOverlay } from "../pilot/panel.js";
import { recordPageConsole } from "./console.js";
import type { ApplyPathResult, ApplyPickResult, AutoSessionInit, ConsoleLogEntry, InspectDomOptions, InspectDomResult, SessionSnapshot, StorageSnapshot, StubFileKind, TraceStep } from "./helpers.js";
import { CONSOLE_LOG_MAX_ENTRIES, TRACE_MAX_STEPS, buildSessionSnapshot, describeHighlight, parsePick, rawTarget, stubFilePath, stubPhaseHasContent } from "./helpers.js";
import { inspectDom, inspectStorage } from "./inspect.js";
import { openSessionBrowser } from "./open-browser.js";
import { readSession, snapshotRead, type SessionRead } from "./read.js";

/**
 * A live session driven over IPC (`browser start`, `pilot start`): the same graph, library, mem and browser as
 * `waygraph auto`, moved one call at a time (`applyPick`, `applyPath`, the raw actions) instead of a menu loop.
 */
export class AutoSession {
  private here: string | null = null;
  private lastRunNote: string | null = null;
  /** Where each mem key's value came from (the replies say it; never the values). */
  private memSources = new Map<string, MemSource>();
  private readonly trace: TraceStep[] = [];
  private readonly consoleLog: ConsoleLogEntry[] = [];
  private lastOverlayInfo: PilotOverlayInfo | null = null;

  private constructor(
    private readonly projectDir: string,
    private readonly inject: string[] | undefined,
    private readonly blocksSelect: import("../../manifest/select.js").BlocksSelect | undefined,
    private graph: Awaited<ReturnType<typeof buildExploreContext>>["graph"],
    private library: Awaited<ReturnType<typeof buildExploreContext>>["library"],
    private readonly mem: MemPage,
    private readonly engine: Engine,
    private readonly closeBrowser: () => Promise<void>,
    private readonly context: BrowserContext,
    private page: Page,
    private readonly startUrl: string | undefined,
    private readonly sessionId: string | undefined,
    private readonly knownInteractionSelectors: string[],
    private readonly headless: boolean,
  ) {}

  static async start(init: AutoSessionInit): Promise<AutoSession> {
    const baseURL = init.baseURL ?? (await resolveBaseUrl(init.projectDir));
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
    const seeded = seedDefaultMem(library.byName, mem);
    const headless = init.headless ?? true;
    const engine = new Engine({ headless });
    const { closeBrowser, context, page } = await openSessionBrowser(init.projectDir, headless, baseURL, startUrl);
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
      closeBrowser,
      context,
      page,
      startUrl,
      init.sessionId,
      knownInteractionSelectors,
      headless,
    );
    session.memSources = new Map(seeded);
    keepOverlayOnNavigation(page, () => session.repaintOverlayAfterNavigation());
    if (!headless) {
      await session.bootstrapOverlay().catch(ignorePageGone);
      await page.bringToFront().catch(ignorePageGone);
    }
    recordPageConsole(page, (entry) => session.pushConsoleLog(entry));
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
    // Every read and every action goes through currentMenu(), so the overlay is refreshed here, awaited: someone
    // watching sees the state an API caller just got back, not a frame behind.
    this.lastOverlayInfo = {
      sessionId: this.sessionId,
      snapshot: await this.snapshotOf(menu),
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
      await updatePilotOverlay(this.page, this.lastOverlayInfo).catch(ignorePageGone);
      return;
    }
    if (!this.headless) {
      await this.bootstrapOverlay().catch(ignorePageGone);
    }
  }

  /**
   * Flags same-origin `<a href>` paths and visible buttons with no NavBlock
   * URL / Block selector in the loaded library — read via `auto console`.
   * Deduped per page load so repeated status/send calls stay quiet.
   */
  private async warnUnmappedInteractions(): Promise<void> {
    const payload: UnmappedInteractionPayload = {
      knownPathnames: knownNavPathnames(this.library.navBlocks, this.page.url()),
      knownSelectors: this.knownInteractionSelectors,
    };
    await this.page.evaluate(unmappedInteractionsPageScript, payload).catch(ignorePageGone);
  }

  /** The Checkpoint the session is at, if known. */
  get where(): string | null { return this.here; }

  /** Pure getter - no Block runs, no mem/page mutation. */
  async currentSnapshot(): Promise<SessionSnapshot> {
    return this.snapshotOf(await this.currentMenu());
  }

  /** The menu as a snapshot, with what the page shows (Read Blocks) when any covers it. */
  private async snapshotOf(menu: ExploreMenu): Promise<SessionSnapshot> {
    const mem = this.memSources.size ? { mem: Object.fromEntries(this.memSources) } : {};
    return { ...buildSessionSnapshot(menu, this.library.byName, this.here, this.lastRunNote), ...mem, ...(await snapshotRead(this.page, this.mem, this.here)) };
  }

  /** Sets keys for the steps that follow (`--data` on send / reach); an error when a name is no Block's key. */
  setData(data: Record<string, unknown>): string | undefined {
    return setStepData(this.library.byName, this.mem, data, this.memSources);
  }

  /** Pure getter - what the page shows, from the project's Read Blocks. */
  async read(path?: string, list?: ListPick): Promise<SessionRead> {
    this.page = await ensureLivePage(this.context, this.page, this.startUrl);
    return readSession(this.page, this.mem, this.here, path, list);
  }

  /**
   * Pure getter - reads the live page's structure at the requested fidelity.
   * No Block runs, no mem/page mutation. `selector` scopes either mode to one
   * element's subtree; it is a modifier, not a third mode.
   */
  async inspectDom(opts: InspectDomOptions): Promise<InspectDomResult> {
    this.page = await ensureLivePage(this.context, this.page, this.startUrl);
    return inspectDom(this.page, opts);
  }

  /** Reads the live page's client state: storage, cookies, service workers (where web-push state lives). */
  async inspectStorage(): Promise<StorageSnapshot> {
    this.page = await ensureLivePage(this.context, this.page, this.startUrl);
    return inspectStorage(this.page, this.context);
  }

  /** Paint + log a Block's authored waygraph overlay fixtures (same as demo does), best-effort. */
  private async paintStubPhase(tag: string, phase: Awaited<ReturnType<typeof runStubPhase>>, holdMs: number): Promise<void> {
    if (!this.page || !stubPhaseHasContent(phase)) return;
    const fixtures = phaseToOverlayFixtures(phase, holdMs);
    for (const line of describeOverlayFixtures(tag, fixtures)) verboseLog("pilot", line);
    await showPilotFixtures(this.page, fixtures).catch(ignorePageGone);
  }

  /**
   * Runs one Block for real: the core of `applyPick` (picked from the live menu) and `applyPath` (named by the route).
   * `expectedTo` is used when the Block's resolve doesn't set `__state`.
   */
  private async runNamedBlock(
    entry: BlockEntry,
    expectedTo: string,
    instanceOption?: WaygraphInstanceOption,
  ): Promise<ApplyPickResult> {
    const from = this.here;
    const stubBeforeResult = await runStubPhase(entry.block, "stubBefore");
    await this.paintStubPhase("stub.before", stubBeforeResult, 6000);
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
      await this.paintStubPhase("stub.after", stubAfterResult, 6000);
      this.pushTrace({
        ...stepBase,
        to: this.here,
        ...(stubPhaseHasContent(stubAfterResult) ? { stubAfter: stubAfterResult } : {}),
      });
    } catch (err) {
      this.lastRunNote = `${entry.block.name} failed`;
      const message = messageOf(err);
      const stubOnErrorResult = await runStubPhase(entry.block, "stubOnError", { error: err });
      await this.paintStubPhase("stub.error", stubOnErrorResult, 8000);
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
      snapshot: await this.snapshotOf(nextMenu),
      quit: false,
    };
  }

  /** Applies exactly one pick: runs at most one Block, returns the resulting state. */
  async applyPick(raw: string): Promise<ApplyPickResult> {
    const menu = await this.currentMenu();
    const pick = parsePick(raw, menu);
    if (pick.type === "invalid") return { ok: false, error: pick.reason };
    if (pick.type === "quit") {
      return {
        ok: true,
        snapshot: await this.snapshotOf(menu),
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
   * Re-reads the project's Blocks and graph from disk (the same call `start()` makes) and swaps them in, keeping the
   * page, mem, browser and `here`: a Block written mid-session becomes pickable without a restart.
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
   * Re-detects `here` from the live page, whatever is cached. `here` only changes when this session acts; a person
   * clicking in a visible session moves the page without it, and later `send` / `reach` calls would use a stale menu.
   */
  async resync(): Promise<ApplyPickResult> {
    this.page = await ensureLivePage(this.context, this.page, this.startUrl);
    await showPilotActivity(this.page, "Running: resync");
    this.here = await detectHere(this.page, this.library.navBlocks);
    const menu = await this.currentMenu();
    this.lastRunNote = `resync -> ${this.here ?? "Unknown"}`;
    return {
      ok: true,
      snapshot: await this.snapshotOf(menu),
      quit: false,
    };
  }

  /**
   * Raw actions for a page no Block covers yet (Blind Pilot). The Checkpoint they land on isn't known ahead, so each
   * one forgets `here` and the next menu re-detects it. A selector that matches nothing is a reported failure.
   */
  async rawClick(selector: string): Promise<ApplyPickResult> {
    return this.rawStep(`click "${selector}"`, async (page) => {
      const target = await rawTarget(page, selector, `click: ${selector}`);
      if (typeof target === "string") return target;
      await target.click();
    });
  }

  async rawType(selector: string, text: string): Promise<ApplyPickResult> {
    return this.rawStep(`type into "${selector}"`, async (page) => {
      const target = await rawTarget(page, selector, `type: ${selector}`);
      if (typeof target === "string") return target;
      await target.fill(text);
    });
  }

  /** Presses a key on an element (`Enter`, `Escape`, ...): inline-edit inputs often commit on Enter, with no Save button. */
  async rawPress(selector: string, key: string): Promise<ApplyPickResult> {
    return this.rawStep(`press "${key}" on "${selector}"`, async (page) => {
      const target = await rawTarget(page, selector, `press ${key}: ${selector}`);
      if (typeof target === "string") return target;
      await target.press(key);
    });
  }

  async rawGoto(url: string): Promise<ApplyPickResult> {
    return this.rawStep(`goto "${url}"`, async (page) => {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
      } catch (err) {
        return `goto "${url}" failed - ${messageOf(err)}`;
      }
    });
  }

  /** Fills an `<input type="file">` with a built-in stub file ("image", "pdf", "video") or a `filePath` of your own. */
  async rawUpload(selector: string, stub: StubFileKind | { filePath: string }): Promise<ApplyPickResult> {
    const filePath = typeof stub === "string" ? stubFilePath(stub) : stub.filePath;
    const label = typeof stub === "string" ? stub : filePath;
    return this.rawStep(`upload ${label} into "${selector}"`, async (page) => {
      const target = await rawTarget(page, selector, `upload ${label}: ${selector}`);
      if (typeof target === "string") return target;
      try {
        await target.setInputFiles(filePath);
      } catch (err) {
        return `upload into "${selector}" failed - ${messageOf(err)}`;
      }
    });
  }

  /** One raw primitive (no Block): announce it, run it, then forget `here` so the next menu re-detects it. */
  private async rawStep(what: string, run: (page: Page) => Promise<string | undefined>): Promise<ApplyPickResult> {
    this.page = await ensureLivePage(this.context, this.page, this.startUrl);
    await showPilotActivity(this.page, `Running (no Block): ${what}`);
    const failed = await run(this.page);
    if (failed !== undefined) return { ok: false, error: failed };
    this.here = null;
    const menu = await this.currentMenu();
    this.lastRunNote = `${what} -> ${this.here ?? "Unknown"}`;
    return {
      ok: true,
      snapshot: await this.snapshotOf(menu),
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
    const detail = describeHighlight(fixtures);
    // Same bottom-left activity toast as Running (Dom)/(Block) - agent narration.
    await showPilotActivity(this.page, `Highlighting: ${detail}`);
    try {
      for (const line of describeOverlayFixtures("highlight", fixtures)) verboseLog("pilot", line);
      const { painted, missing } = await showPilotFixtures(this.page, fixtures);
      const menu = await this.currentMenu();
      this.lastRunNote = fixtures.clear
        ? "highlight cleared"
        : `highlight painted ${painted}` +
          (missing.length ? ` (missing: ${missing.join(", ")})` : "");
      return { ok: true, painted, missing, snapshot: await this.snapshotOf(menu) };
    } catch (err) {
      return { ok: false, error: `highlight failed - ${messageOf(err)}` };
    }
  }

  /**
   * Runs a whole route to `targetCheckpoint` in one call, instead of one `applyPick` per step. The path is computed
   * once with `findBlockPathDetailed` (the BFS `auto --blocks <From> <To>` uses) and each hop's Block runs directly on
   * the session's live page and mem, trusting the graph rather than live-menu visibility. Per-step choosing was tried
   * and fails: a `from: "*"` edge looks reachable from anywhere to a static BFS. A step whose precondition isn't met
   * fails loud, naming it; so does a step that runs but lands somewhere other than its edge promised.
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
      // One option per row (add *this* item): runs when mem already says which (--data, a pick, a mem stub).
      if (entry.block.instanceOptions && !(this.page && (await optionChosen(entry, this.page, this.mem)))) {
        return { ok: false, error: `path step "${step.block}" needs a specific live option chosen (one per row, e.g. per product) and mem doesn't say which - pick one with send <index>, or give its key with --data or a mem stub` };
      }
      if (this.page) await showPilotActivity(this.page, `Running (Block): ${step.block} (reach -> ${targetCheckpoint})`);
      const result = await this.runNamedBlock(entry, step.to);
      if (!result.ok) {
        return { ok: false, error: `step "${step.block}" failed - ${result.error}` };
      }
      // A Block can land somewhere else without throwing (submit-login stays on LoginPage on bad auth): compare with
      // what this hop's own edge promised (`step.to`; one name can have several edges).
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
    await this.closeBrowser();
  }
}
