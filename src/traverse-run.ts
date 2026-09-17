/**
 * Phase B: serial graph traverse (RFC traverse-ffcompose).
 * Walk unused legal edges until leaf / budget / break. No parallel yet.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import { Engine, start, end, locate } from "./engine.js";
import type { NavBlock } from "./engine.js";
import { MemPage, type MemKey } from "./mem-page.js";
import type { Checkpoint } from "./types.js";
import {
  buildExploreContext,
  buildExploreMenu,
  type BlockEntry,
  type ExploreEdge,
} from "./auto-explore.js";
import { defaultMemValueForKey } from "./auto-explore-run.js";

export interface TraverseOptions {
  baseURL?: string;
  startUrl?: string;
  /** Seed checkpoint label (optional - otherwise detect from page / nav). */
  from?: string;
  /** Global Mem seed JSON (or use WAYGRAPH_DATA / WAYGRAPH_AUTO_MEM). */
  data?: string;
  /** Max Block runs this traverse (default 50). */
  maxSteps?: number;
  /** Max times a checkpoint may be visited (default 2). */
  maxVisitsPerNode?: number;
  /** Max times an edge key (block::instanceId) may be taken (default 1). */
  maxVisitsPerEdge?: number;
  /** Wall-clock budget ms (default 15m). */
  timeoutMs?: number;
  /** Show browser (default headless). */
  headed?: boolean;
  /** Traverse id for greppable lines (default traverse-1). */
  traverseId?: string;
  /** Phase C: glob / regex / bare `--blocks` file select. */
  blocksSelect?: import("./blocks-select.js").BlocksSelect;
}

function resolveBaseUrl(projectDir: string): string | undefined {
  if (process.env.WAYGRAPH_BASE_URL) return process.env.WAYGRAPH_BASE_URL;
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) return undefined;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      waygraph?: { baseUrl?: string };
    };
    return pkg.waygraph?.baseUrl;
  } catch {
    return undefined;
  }
}

function seedMem(library: Map<string, BlockEntry>, mem: MemPage, dataJson?: string): void {
  const raw = dataJson ?? process.env.WAYGRAPH_DATA ?? process.env.WAYGRAPH_AUTO_MEM;
  let envParsed: Record<string, unknown> = {};
  if (raw) {
    try {
      envParsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error(`waygraph traverse: --data / WAYGRAPH_DATA is not valid JSON`);
    }
  }
  for (const entry of library.values()) {
    for (const k of entry.block.requires ?? []) {
      if (mem.has(k)) continue;
      if (k.name in envParsed) {
        mem.set(k, envParsed[k.name]);
        continue;
      }
      const def = defaultMemValueForKey(k.name);
      if (def !== undefined) mem.set(k, def);
    }
  }
}

function missingMemKeys(entry: BlockEntry, mem: MemPage): MemKey<unknown>[] {
  return (entry.block.requires ?? []).filter((k) => !mem.has(k));
}

function ensureMem(entry: BlockEntry, mem: MemPage): void {
  const missing = missingMemKeys(entry, mem);
  if (missing.length === 0) return;
  throw new Error(
    `Block "${entry.block.name}" needs Mem keys: ${missing.map((k) => k.name).join(", ")} ` +
      `(pass --data '{...}' or WAYGRAPH_DATA)`,
  );
}

function edgeKey(edge: ExploreEdge): string {
  const id = edge.instanceOption?.id;
  return id ? `${edge.block}::${id}` : edge.block;
}

async function detectHere(page: Page, navBlocks: BlockEntry[]): Promise<string | null> {
  try {
    const url = page.url();
    if (url.includes("/login")) return "PiaLogin";
    if (url.includes("mailpit") || url.includes(":54324") || url.includes("/mailhog")) {
      return "PiaMailpitGui";
    }
  } catch {
    /* ignore */
  }
  const tags = navBlocks.map((n) => n.block) as NavBlock<Checkpoint<string>>[];
  return locate(page, tags, { timeoutMs: 1500 });
}

async function runOneBlock(
  engine: Engine,
  entry: BlockEntry,
  context: BrowserContext,
  page: Page,
  mem: MemPage,
): Promise<Checkpoint<string>> {
  const flow = engine.defineFlow([start, entry.block, end]);
  const BLOCK_TIMEOUT_MS = 45_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ran = await Promise.race([
      flow.run(context, mem, { page, closeOnFinish: false }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Block "${entry.block.name}" timed out after ${BLOCK_TIMEOUT_MS / 1000}s`,
              ),
            ),
          BLOCK_TIMEOUT_MS,
        );
      }),
    ]);
    return ran.result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Serial graph crawl. Prints greppable PASS/FAIL lines; non-zero exit on break.
 */
export async function runTraverse(projectDir: string, options: TraverseOptions = {}): Promise<number> {
  const traverseId = options.traverseId ?? "traverse-1";
  const maxSteps = options.maxSteps ?? 50;
  const maxVisitsPerNode = options.maxVisitsPerNode ?? 2;
  const maxVisitsPerEdge = options.maxVisitsPerEdge ?? 1;
  const timeoutMs = options.timeoutMs ?? 15 * 60_000;
  const headed = options.headed === true || process.env.WAYGRAPH_HEADED === "1";
  const baseURL = options.baseURL ?? resolveBaseUrl(projectDir) ?? process.env.WAYGRAPH_BASE_URL;
  const startUrl = options.startUrl ?? baseURL;

  const { graph, library } = await buildExploreContext(
    projectDir,
    options.blocksSelect ? { blocksSelect: options.blocksSelect } : undefined,
  );
  if (options.blocksSelect) {
    console.error(
      `waygraph traverse: --blocks ${options.blocksSelect.raw} → ` +
        `${library.byName.size} block(s), ${graph.edges.length} edge(s)`,
    );
  }
  const mem = new MemPage();
  seedMem(library.byName, mem, options.data);

  const engine = new Engine({ headless: !headed, slowMo: headed ? 100 : 0 });
  const { chromium } = await import("@playwright/test");
  const executablePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
  const launchOpts: Parameters<typeof chromium.launch>[0] = {
    headless: !headed,
  };
  if (executablePath) launchOpts.executablePath = executablePath;
  const browser = await chromium.launch(launchOpts);
  const contextOpts: Parameters<typeof browser.newContext>[0] = {
    viewport: { width: 1280, height: 720 },
  };
  if (baseURL) contextOpts.baseURL = baseURL;
  const context = await browser.newContext(contextOpts);
  let page = await context.newPage();

  const nodeVisits = new Map<string, number>();
  const edgeVisits = new Map<string, number>();
  const edgesHit = new Set<string>();
  let steps = 0;
  const startedAt = Date.now();
  let lastHere: string | null = options.from ?? null;
  let exitCode = 0;

  console.error(
    `waygraph traverse[${traverseId}]: ${graph.nodes.length} node(s), ${graph.edges.length} edge(s)` +
      (baseURL ? ` base=${baseURL}` : "") +
      ` maxSteps=${maxSteps} maxVisits/node=${maxVisitsPerNode} maxVisits/edge=${maxVisitsPerEdge}`,
  );

  try {
    if (startUrl) {
      await page.goto(startUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForLoadState("load").catch(() => {});
    }

    for (;;) {
      if (Date.now() - startedAt > timeoutMs) {
        console.log(
          `[Killed timeout[${traverseId}] node=${lastHere ?? "?"} wallMs=${timeoutMs}]`,
        );
        exitCode = 1;
        break;
      }
      if (steps >= maxSteps) {
        console.log(
          `[Killed max-steps[${traverseId}] node=${lastHere ?? "?"} steps=${steps} max=${maxSteps}]`,
        );
        exitCode = 1;
        break;
      }

      if (page.isClosed()) {
        page = await context.newPage();
        if (startUrl) {
          await page.goto(startUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
        }
      }

      const detected = await detectHere(page, library.navBlocks);
      const here = lastHere ?? detected ?? options.from ?? null;

      if (here && (nodeVisits.get(here) ?? 0) >= maxVisitsPerNode) {
        console.log(
          `[Killed loop[${traverseId}] node=${here} visits=${nodeVisits.get(here)} max=${maxVisitsPerNode}]`,
        );
        exitCode = 1;
        break;
      }

      const menu = await buildExploreMenu(page, graph, library, here);
      const candidates = menu.flat.filter((edge) => {
        const key = edgeKey(edge);
        return (edgeVisits.get(key) ?? 0) < maxVisitsPerEdge;
      });

      if (candidates.length === 0) {
        const label = here ?? detected ?? "unknown";
        console.log(`[Reached Leaf Node[${traverseId}] at=${label} steps=${steps}]`);
        console.error(
          `waygraph traverse[${traverseId}]: PASS leaf edgesHit=${edgesHit.size} steps=${steps}`,
        );
        break;
      }

      const pick = [...candidates].sort((a, b) => {
        const aWild = a.from === "*" ? 1 : 0;
        const bWild = b.from === "*" ? 1 : 0;
        if (aWild !== bWild) return aWild - bWild;
        return edgeKey(a).localeCompare(edgeKey(b));
      })[0]!;

      const entry = library.byName.get(pick.block);
      if (!entry) {
        console.log(
          `[Broke at edge[${traverseId}] block=${pick.block} from=${here ?? "?"} to=${pick.to} reason=not-loaded]`,
        );
        exitCode = 1;
        break;
      }

      const fromLabel = here ?? pick.from;
      try {
        if (pick.instanceOption) {
          mem.set(pick.instanceOption.key, pick.instanceOption.value);
        }
        ensureMem(entry, mem);

        console.error(
          `waygraph traverse[${traverseId}]: step ${steps + 1} ${fromLabel} -[${pick.block}]-> ${pick.to}` +
            (pick.label ? ` (${pick.label})` : ""),
        );

        const out = await runOneBlock(engine, entry, context, page, mem);
        const observed =
          typeof out === "object" && out && "__state" in out
            ? String((out as { __state: string }).__state)
            : pick.to;

        const key = edgeKey(pick);
        edgeVisits.set(key, (edgeVisits.get(key) ?? 0) + 1);
        edgesHit.add(key);
        if (here) nodeVisits.set(here, (nodeVisits.get(here) ?? 0) + 1);
        lastHere = observed;
        steps += 1;

        if (observed !== pick.to && pick.to !== "*") {
          console.error(
            `waygraph traverse[${traverseId}]: WARN static to=${pick.to} observed=${observed}`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(
          `[Broke at edge[${traverseId}] block=${pick.block} from=${fromLabel} to=${pick.to}] ${msg}`,
        );
        exitCode = 1;
        break;
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  console.error(
    `waygraph traverse[${traverseId}]: done exit=${exitCode} steps=${steps} edgesHit=${edgesHit.size}`,
  );
  return exitCode;
}
