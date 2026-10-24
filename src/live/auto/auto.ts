// `waygraph auto`: the explore loop - where the page is, the menu, run the picked Block, repeat.
import type { BrowserContext, BrowserContextOptions, Page } from "@playwright/test";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { installDemoChrome, instrumentAutoInteractions } from "../../demo/overlay/auto-chrome.js";
import { keepOverlayOnNavigation } from "../../demo/overlay/reattach.js";
import type { NavBlock } from "../../engine/block/kinds/nav.js";
import type { Checkpoint } from "../../engine/checkpoint/checkpoint.js";
import { Engine } from "../../engine/engine.js";
import { envString } from "../../engine/env.js";
import { buildFlow } from "../../engine/flow/flow.js";
import { locate } from "../../engine/locate.js";
import { MemPage } from "../../engine/mem/mem.js";
import { ignorePageGone, ignoreTimeout } from "../../engine/page-gone.js";
import type { BlockEntry } from "../../manifest/project.js";
import { chromiumExecutablePath, launchContext } from "../../runtime/browser.js";
import { configuredExtensions, resolveBaseUrl } from "../../runtime/waygraph-config.js";
import { withWebServer } from "../../runtime/webserver.js";
import {
    buildExploreContext,
    buildExploreMenu,
} from "./explore.js";
import { ensureMem, seedDefaultMem } from "./mem.js";
import { armPickWait, cliPick, headfulPick, PickResult, printCliMenu, setAutoPanelRunning, syncPanelMem } from "./menu.js";

export interface AutoExploreOptions {
  /** Terminal menu (browser still runs for act()). Default false = headful picker panel. */
  cli?: boolean;
  baseURL?: string;
  /** Initial URL when the page is blank (defaults to baseURL). */
  startUrl?: string;
  /** Phase C: glob / regex / bare `--blocks` file select for discovery. */
  blocksSelect?: import("../../manifest/select.js").BlocksSelect;
}


/** Which Checkpoint the page is on, asked of the project's own Nav / Page Blocks (their verify). */
export async function detectHere(page: Page, navBlocks: BlockEntry[]): Promise<string | null> {
  const tags = navBlocks.map((n) => n.block) as NavBlock<Checkpoint<string>>[];
  return locate(page, tags, { timeoutMs: 1500 });
}

export async function ensureLivePage(
  context: BrowserContext,
  page: Page,
  startUrl: string | undefined,
): Promise<Page> {
  if (!page.isClosed()) return page;
  const fresh = await context.newPage();
  if (startUrl) {
    await fresh.goto(startUrl, { waitUntil: "domcontentloaded" }).catch(ignorePageGone);
    await fresh.waitForLoadState("load").catch(ignoreTimeout);
  }
  return fresh;
}

export async function runOneBlock(
  engine: Engine,
  entry: BlockEntry,
  context: BrowserContext,
  page: Page,
  mem: MemPage,
  headful: boolean,
): Promise<Checkpoint<string>> {
  const navClick = (entry.block as { __waygraphNavClick?: string }).__waygraphNavClick;
  if (entry.kind === "nav" && navClick !== undefined) {
    await page
      .evaluate(
        (label) => {
          window.__wgPendingNavClickLabel = label;
        },
        `nav: ${entry.block.name}`,
      )
      .catch(ignorePageGone);
  }
  if (headful) await setAutoPanelRunning(page, entry.block.name);
  const flow = buildFlow([entry.block], engine.config);
  const BLOCK_TIMEOUT_MS = 45_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let result: Checkpoint<string>;
  try {
    const ran = await Promise.race([
      flow.run(context, mem, { page, closeOnFinish: false }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Block "${entry.block.name}" timed out after ${BLOCK_TIMEOUT_MS / 1000}s - ` +
                  "click Quit and retry, or check network / mem credentials",
              ),
            ),
          BLOCK_TIMEOUT_MS,
        );
      }),
    ]);
    result = ran.result;
  } finally {
    if (timer) clearTimeout(timer);
  }
  await page.evaluate("delete window.__wgPendingNavClickLabel").catch(ignorePageGone);
  return result;
}

/** Shown in the headful panel after each Block run. */
let lastRunNote: string | null = null;

/**
 * Interactive waygraph auto: locate current Checkpoint, list runnable Blocks, pick one, repeat.
 */
export async function runAutoExplore(projectDir: string, options: AutoExploreOptions = {}): Promise<void> {
  await withWebServer(projectDir, () => runAutoExploreCore(projectDir, options));
}

async function runAutoExploreCore(projectDir: string, options: AutoExploreOptions = {}): Promise<void> {
  lastRunNote = null;
  const cli = options.cli === true;
  const baseURL = options.baseURL ?? (await resolveBaseUrl(projectDir)) ?? envString("WAYGRAPH_BASE_URL");
  const startUrl = options.startUrl ?? baseURL;
  const { graph, library } = await buildExploreContext(
    projectDir,
    options.blocksSelect ? { blocksSelect: options.blocksSelect } : undefined,
  );
  if (options.blocksSelect) {
    console.error(
      `waygraph auto: --blocks ${options.blocksSelect.raw} → ` +
        `${library.byName.size} block(s), ${graph.edges.length} edge(s)`,
    );
  }
  const mem = new MemPage();
  seedDefaultMem(library.byName, mem);
  const engine = cli ? new Engine({ headless: true }) : new Engine({ headless: false, slowMo: 250 });
  const { chromium } = await import("@playwright/test");
  const executablePath = chromiumExecutablePath();
  const launchOpts: Parameters<typeof chromium.launch>[0] = {
    headless: cli,
    args: cli ? [] : ["--start-maximized"],
  };
  if (!cli) launchOpts.slowMo = 250;
  if (executablePath) launchOpts.executablePath = executablePath;
  const contextOpts: BrowserContextOptions = cli
    ? { viewport: { width: 1280, height: 720 } }
    : { viewport: null };
  if (baseURL) contextOpts.baseURL = baseURL;
  const { close: closeBrowser, context } = await launchContext({
    launcher: chromium,
    launch: launchOpts,
    context: contextOpts,
    extensions: await configuredExtensions(projectDir),
  });
  let page = await context.newPage();
  if (startUrl) {
    await page.goto(startUrl, { waitUntil: "domcontentloaded" }).catch(ignorePageGone);
    await page.waitForLoadState("load").catch(ignoreTimeout);
  }
  console.error(
    `waygraph auto: ${graph.nodes.length} checkpoint(s), ${graph.edges.length} edge(s) - ` +
      (cli ? "CLI picker (terminal menu)" : "headful picker (browser panel)"),
  );

  const pickSlot: { resolve: ((v: PickResult) => void) | null } = { resolve: null };
  let wiredPage: Page | null = null;

  async function wirePage(target: Page): Promise<void> {
    if (wiredPage === target) return;
    await target.exposeFunction("__wgAutoPick", (index: number) => {
      pickSlot.resolve?.({ type: "pick", index });
    });
    await target.exposeFunction("__wgAutoQuit", () => {
      pickSlot.resolve?.({ type: "quit" });
    });
    if (!cli) {
      await installDemoChrome(target, "", { banner: false });
      keepOverlayOnNavigation(target, () => installDemoChrome(target, "", { banner: false }));
      instrumentAutoInteractions(target, mem, 250);
    }
    wiredPage = target;
  }

  let here: string | null = null;
  const cliRl = cli ? createInterface({ input, output }) : null;
  try {
    for (;;) {
      page = await ensureLivePage(context, page, startUrl);
      await wirePage(page);
      const pickWait = armPickWait();
      pickSlot.resolve = pickWait.resolve;
      if (here === null) {
        here = await detectHere(page, library.navBlocks);
      }
      if (cli) console.error("waygraph auto: scanning page for moves ...");
      const menu = await buildExploreMenu(page, graph, library, here);
      if (cli) console.error(`waygraph auto: ${menu.flat.length} move(s) available`);
      if (menu.flat.length === 0) {
        const fromHere = graph.edges.filter((e) => e.from === here).map((e) => e.block);
        const missing = [...new Set(fromHere)].filter((b) => !library.byName.has(b));
        console.error(
          here
            ? `waygraph auto: no runnable Blocks on "${here}"` +
                (fromHere.length
                  ? ` (graph has: ${[...new Set(fromHere)].join(", ")}${missing.length ? `; not loaded: ${missing.join(", ")}` : ""})`
                  : " - nothing on this page matches the graph.") +
                (cli ? "" : " Tip: waygraph auto --cli")
            : "waygraph auto: location unknown - pick nav-login (Start here) if shown.",
        );
        if (cli) break;
      }

      let pick: PickResult;
      if (cli && cliRl) {
        printCliMenu(menu, library.byName);
        pick = await cliPick(menu, cliRl);
      } else {
        pick = await headfulPick(page, menu, library.byName, mem, () => pickWait.promise, lastRunNote);
      }

      if (pick.type === "quit") break;

      if (pick.index < 0 || pick.index >= menu.flat.length) continue;
      const edge = menu.flat[pick.index]!;
      const entry = library.byName.get(edge.block);
      if (!entry) {
        console.error(`waygraph auto: Block "${edge.block}" not loaded - skipped`);
        continue;
      }

      try {
        if (edge.instanceOption) {
          mem.set(edge.instanceOption.key, edge.instanceOption.value);
        }
        if (!cli && (entry.block.requires?.length ?? 0) > 0) {
          await syncPanelMem(page, mem, entry.block.requires ?? []);
        } else {
          await ensureMem(entry, mem, cli);
        }
        const pickLabel = edge.label ?? entry.block.name;
        console.error(`waygraph auto: running [${pick.index + 1}] ${pickLabel} ...`);
        const result = await runOneBlock(engine, entry, context, page, mem, !cli);
        // Trust block output over locate() - nav verify traits collide on /dashboard.
        here = result.__state ?? edge.to;
        lastRunNote = `${entry.block.name} -> ${here}`;
        console.error(`waygraph auto: ran ${entry.block.name} -> ${here}`);
      } catch (err) {
        lastRunNote = `${entry.block.name} failed`;
        console.error(`waygraph auto: ${entry.block.name} failed - ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    cliRl?.close();
    await context.close();
    await closeBrowser();
  }
}
