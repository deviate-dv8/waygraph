/**
 * Phase B+D: graph traverse (serial or --parallel with --session clone).
 * Walk unused legal edges until leaf / budget / break.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Browser, BrowserContext, Page } from "@playwright/test";
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
import type { WaygraphGraph } from "./graph.js";
import { defaultMemValueForKey } from "./auto-explore-run.js";
import { EdgeLeaseCoordinator } from "./traverse-lease.js";
import {
  buildCoverageReport,
  collectGraphEdgeKeys,
  defaultCoverageOutPath,
  formatCoverageLine,
  writeCoverageReport,
} from "./traverse-coverage.js";

export type TraverseSessionMode = "clone" | "inherit";

export interface TraverseWorkerResult {
  exitCode: number;
  steps: number;
  edgesHit: string[];
  leaf?: string;
}

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
  /** Phase D: parallel workers (default 1). Cap 4. */
  parallel?: number;
  /** Phase D: clone (default) or inherit. Inherit refused when parallel > 1. */
  session?: TraverseSessionMode;
  /**
   * Phase E: fail suite (exit 2) when hit/total ratio is below this 0-1 fraction.
   * Leaf PASS alone does not satisfy the gate.
   */
  minEdgeCoverage?: number;
  /** Phase E: write coverage JSON here (default `.waygraph-traverse/coverage.json`). */
  coverageOut?: string;
  /** Phase E: skip writing coverage.json (still prints the Coverage line). */
  noCoverageReport?: boolean;
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

function snapshotMem(
  library: Map<string, BlockEntry>,
  mem: MemPage,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const entry of library.values()) {
    for (const k of entry.block.requires ?? []) {
      if (mem.has(k) && !(k.name in out)) {
        try {
          out[k.name] = mem.get(k);
        } catch {
          /* skip */
        }
      }
    }
  }
  return out;
}

function restoreMem(
  library: Map<string, BlockEntry>,
  mem: MemPage,
  snap: Record<string, unknown>,
  dataJson?: string,
): void {
  seedMem(library, mem, dataJson);
  for (const entry of library.values()) {
    for (const k of entry.block.requires ?? []) {
      if (k.name in snap) {
        mem.set(k, snap[k.name]);
      }
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

interface WorkerOpts {
  traverseId: string;
  workerIndex: number;
  parallel: number;
  maxSteps: number;
  maxVisitsPerNode: number;
  maxVisitsPerEdge: number;
  timeoutMs: number;
  from?: string;
  startUrl?: string;
  baseURL?: string;
  data?: string;
  graph: WaygraphGraph;
  library: Awaited<ReturnType<typeof buildExploreContext>>["library"];
  engine: Engine;
  context: BrowserContext;
  page: Page;
  mem: MemPage;
  leases: EdgeLeaseCoordinator;
}

async function runTraverseWorker(opts: WorkerOpts): Promise<TraverseWorkerResult> {
  const {
    traverseId,
    workerIndex,
    parallel,
    maxSteps,
    maxVisitsPerNode,
    maxVisitsPerEdge,
    timeoutMs,
    graph,
    library,
    engine,
    context,
    mem,
    leases,
  } = opts;
  let page = opts.page;
  const startUrl = opts.startUrl;
  const nodeVisits = new Map<string, number>();
  const edgeVisits = new Map<string, number>();
  const edgesHit = new Set<string>();
  let steps = 0;
  const startedAt = Date.now();
  let lastHere: string | null = opts.from ?? null;
  let exitCode = 0;
  let leaf: string | undefined;

  try {
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
      const here = lastHere ?? detected ?? opts.from ?? null;

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
        if ((edgeVisits.get(key) ?? 0) >= maxVisitsPerEdge) return false;
        if (parallel > 1) {
          if (EdgeLeaseCoordinator.partitionIndex(key, parallel) !== workerIndex) {
            return false;
          }
        }
        return true;
      });

      if (candidates.length === 0) {
        const label = here ?? detected ?? "unknown";
        leaf = label;
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

      const key = edgeKey(pick);
      if (!leases.tryClaim(key, traverseId)) {
        // Another worker won a race (instance fan-out); treat as unavailable.
        edgeVisits.set(key, maxVisitsPerEdge);
        continue;
      }

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
    console.error(
      `waygraph traverse[${traverseId}]: done exit=${exitCode} steps=${steps} edgesHit=${edgesHit.size}`,
    );
  }
  return {
    exitCode,
    steps,
    edgesHit: [...edgesHit],
    ...(leaf ? { leaf } : {}),
  };
}

/**
 * Serial or parallel graph crawl. Prints greppable PASS/FAIL + Coverage lines.
 * Exit: 0 leaf ok (+ coverage ok), 1 break/timeout, 2 coverage gate fail (Phase E).
 */
export async function runTraverse(projectDir: string, options: TraverseOptions = {}): Promise<number> {
  let parallel = Math.max(1, Math.floor(options.parallel ?? 1));
  if (parallel > 4) {
    console.error(`waygraph traverse: --parallel ${parallel} capped to 4`);
    parallel = 4;
  }
  const session: TraverseSessionMode = options.session ?? (parallel > 1 ? "clone" : "clone");
  if (parallel > 1 && session === "inherit") {
    console.error(
      "waygraph traverse: --session inherit is refused with --parallel > 1 (races); use --session clone",
    );
    return 1;
  }

  const maxSteps = options.maxSteps ?? 50;
  const maxVisitsPerNode = options.maxVisitsPerNode ?? 2;
  const maxVisitsPerEdge = options.maxVisitsPerEdge ?? 1;
  const timeoutMs = options.timeoutMs ?? 15 * 60_000;
  const headed = options.headed === true || process.env.WAYGRAPH_HEADED === "1";
  const baseURL = options.baseURL ?? resolveBaseUrl(projectDir) ?? process.env.WAYGRAPH_BASE_URL;
  const startUrl = options.startUrl ?? baseURL;
  const minEdgeCoverage =
    options.minEdgeCoverage != null && Number.isFinite(options.minEdgeCoverage)
      ? options.minEdgeCoverage
      : undefined;
  const coverageOut = options.coverageOut ?? defaultCoverageOutPath(projectDir);

  const { graph, library } = await buildExploreContext(
    projectDir,
    options.blocksSelect ? { blocksSelect: options.blocksSelect } : undefined,
  );
  if (options.blocksSelect) {
    console.error(
      `waygraph traverse: --blocks ${options.blocksSelect.raw} -> ` +
        `${library.byName.size} block(s), ${graph.edges.length} edge(s)`,
    );
  }

  const allEdgeKeys = collectGraphEdgeKeys(graph.edges);
  const leases = new EdgeLeaseCoordinator({ projectDir, persist: parallel > 1 });
  const engine = new Engine({ headless: !headed, slowMo: headed ? 100 : 0 });
  const { chromium } = await import("@playwright/test");
  const executablePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
  const launchOpts: Parameters<typeof chromium.launch>[0] = {
    headless: !headed,
  };
  if (executablePath) launchOpts.executablePath = executablePath;
  const browser: Browser = await chromium.launch(launchOpts);

  console.error(
    `waygraph traverse: ${graph.nodes.length} node(s), ${graph.edges.length} edge(s)` +
      (baseURL ? ` base=${baseURL}` : "") +
      ` parallel=${parallel} session=${session}` +
      ` maxSteps=${maxSteps} maxVisits/node=${maxVisitsPerNode} maxVisits/edge=${maxVisitsPerEdge}` +
      (minEdgeCoverage !== undefined
        ? ` minEdgeCoverage=${(minEdgeCoverage * 100).toFixed(1)}%`
        : ""),
  );

  const emitCoverage = (
    workers: Array<{ traverseId: string; result: TraverseWorkerResult }>,
  ): number => {
    const hitUnion = new Set<string>();
    for (const w of workers) {
      for (const k of w.result.edgesHit) hitUnion.add(k);
    }
    const report = buildCoverageReport({
      projectDir,
      parallel,
      allEdgeKeys,
      hitKeys: hitUnion,
      ...(minEdgeCoverage !== undefined ? { minEdgeCoverage } : {}),
      workers: workers.map(({ traverseId, result }) => ({
        traverseId,
        exitCode: result.exitCode,
        steps: result.steps,
        edgesHit: result.edgesHit.length,
        ...(result.leaf ? { leaf: result.leaf } : {}),
      })),
    });
    console.log(formatCoverageLine(report));
    console.error(
      `waygraph traverse: coverage hit=${report.edgesHit}/${report.edgesTotal}` +
        (report.missed.length
          ? ` missed=${report.missed.slice(0, 8).join(",")}${report.missed.length > 8 ? "..." : ""}`
          : "") +
        (options.noCoverageReport ? "" : ` report=${coverageOut}`),
    );
    if (!options.noCoverageReport) {
      writeCoverageReport(coverageOut, report);
    }
    if (report.coveragePass === false) {
      console.error(
        `waygraph traverse: FAIL coverage gate ratio=${(report.ratio * 100).toFixed(1)}%` +
          ` < min=${((report.minEdgeCoverage ?? 0) * 100).toFixed(1)}%`,
      );
      return 2;
    }
    return 0;
  };

  try {
    if (parallel <= 1) {
      const contextOpts: Parameters<Browser["newContext"]>[0] = {
        viewport: { width: 1280, height: 720 },
      };
      if (baseURL) contextOpts.baseURL = baseURL;
      const context = await browser.newContext(contextOpts);
      const page = await context.newPage();
      const mem = new MemPage();
      seedMem(library.byName, mem, options.data);
      if (startUrl) {
        await page.goto(startUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
        await page.waitForLoadState("load").catch(() => {});
      }
      const traverseId = options.traverseId ?? "traverse-1";
      const result = await runTraverseWorker({
        traverseId,
        workerIndex: 0,
        parallel: 1,
        maxSteps,
        maxVisitsPerNode,
        maxVisitsPerEdge,
        timeoutMs,
        ...(options.from ? { from: options.from } : {}),
        ...(startUrl ? { startUrl } : {}),
        ...(baseURL ? { baseURL } : {}),
        ...(options.data ? { data: options.data } : {}),
        graph,
        library,
        engine,
        context,
        page,
        mem,
        leases,
      });
      await context.close().catch(() => {});
      const coverageCode = emitCoverage([{ traverseId, result }]);
      if (result.exitCode !== 0) return result.exitCode;
      return coverageCode;
    }

    // Phase D: bootstrap one context for storageState, then N clones.
    const bootOpts: Parameters<Browser["newContext"]>[0] = {
      viewport: { width: 1280, height: 720 },
    };
    if (baseURL) bootOpts.baseURL = baseURL;
    const bootContext = await browser.newContext(bootOpts);
    const bootPage = await bootContext.newPage();
    const bootMem = new MemPage();
    seedMem(library.byName, bootMem, options.data);
    if (startUrl) {
      await bootPage.goto(startUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
      await bootPage.waitForLoadState("load").catch(() => {});
    }
    const storageState = await bootContext.storageState();
    const memSnap = snapshotMem(library.byName, bootMem);
    await bootContext.close().catch(() => {});

    console.error(
      `waygraph traverse: forked ${parallel} clone workers (storageState + mem snapshot)`,
    );

    const workerMeta: Array<{ traverseId: string; result: TraverseWorkerResult }> =
      await Promise.all(
        Array.from({ length: parallel }, async (_, i) => {
          const traverseId = `traverse-${i + 1}`;
          const ctxOpts: Parameters<Browser["newContext"]>[0] = {
            viewport: { width: 1280, height: 720 },
            storageState,
          };
          if (baseURL) ctxOpts.baseURL = baseURL;
          const context = await browser.newContext(ctxOpts);
          const page = await context.newPage();
          const mem = new MemPage();
          restoreMem(library.byName, mem, memSnap, options.data);
          if (startUrl) {
            await page.goto(startUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
          }
          try {
            const result = await runTraverseWorker({
              traverseId,
              workerIndex: i,
              parallel,
              maxSteps,
              maxVisitsPerNode,
              maxVisitsPerEdge,
              timeoutMs,
              ...(options.from ? { from: options.from } : {}),
              ...(startUrl ? { startUrl } : {}),
              ...(baseURL ? { baseURL } : {}),
              ...(options.data ? { data: options.data } : {}),
              graph,
              library,
              engine,
              context,
              page,
              mem,
              leases,
            });
            return { traverseId, result };
          } finally {
            await context.close().catch(() => {});
          }
        }),
      );

    const results = workerMeta.map((w) => w.result);
    const worst = results.reduce((a, b) => Math.max(a, b.exitCode), 0);
    const pass = results.filter((c) => c.exitCode === 0).length;
    console.error(
      `waygraph traverse: suite parallel=${parallel} pass=${pass}/${parallel} exit=${worst}`,
    );

    const coverageCode = emitCoverage(workerMeta);
    if (worst !== 0) return worst;
    return coverageCode;
  } finally {
    await browser.close().catch(() => {});
  }
}
