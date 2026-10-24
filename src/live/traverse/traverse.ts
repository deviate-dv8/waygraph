/**
 * Phase B+D: graph traverse (serial or --parallel with --session clone).
 * Walk unused legal edges until leaf / budget / break.
 */
import type { Browser } from "@playwright/test";
import { Engine } from "../../engine/engine.js";
import { envFlag, envString } from "../../engine/env.js";
import { MemPage } from "../../engine/mem/mem.js";
import { ignorePageGone, ignoreTimeout } from "../../engine/page-gone.js";
import { chromiumExecutablePath } from "../../runtime/browser.js";
import { resolveBaseUrl } from "../../runtime/waygraph-config.js";
import {
    buildExploreContext,
} from "../auto/explore.js";
import {
    buildCoverageReport,
    collectGraphEdgeKeys,
    defaultCoverageOutPath,
    formatCoverageLine,
    writeCoverageReport,
} from "./coverage.js";
import { EdgeLeaseCoordinator } from "./lease.js";
import { restoreMem, runTraverseWorker, seedMem, snapshotMem } from "./worker.js";

/** How `traverse` workers share a browser: one session, or a clone per worker. */
export type TraverseSessionMode = "clone" | "inherit";

/** What one `traverse` worker did: edges walked and failures. */
export interface TraverseWorkerResult {
  exitCode: number;
  steps: number;
  edgesHit: string[];
  leaf?: string;
}

/** Options for `runTraverse`: workers, session mode, step limit, coverage gate. */
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
  blocksSelect?: import("../../manifest/select.js").BlocksSelect;
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
  const headed = options.headed === true || envFlag("WAYGRAPH_HEADED");
  const baseURL = options.baseURL ?? (await resolveBaseUrl(projectDir)) ?? envString("WAYGRAPH_BASE_URL");
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
  if (envString("WAYGRAPH_EXTENSIONS")) console.error("waygraph traverse: extensions are not loaded (workers use plain contexts)");
  const { chromium } = await import("@playwright/test");
  const executablePath = chromiumExecutablePath();
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
        await page.goto(startUrl, { waitUntil: "domcontentloaded" }).catch(ignorePageGone);
        await page.waitForLoadState("load").catch(ignoreTimeout);
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
      await context.close().catch(ignorePageGone);
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
      await bootPage.goto(startUrl, { waitUntil: "domcontentloaded" }).catch(ignorePageGone);
      await bootPage.waitForLoadState("load").catch(ignoreTimeout);
    }
    const storageState = await bootContext.storageState();
    const memSnap = snapshotMem(library.byName, bootMem);
    await bootContext.close().catch(ignorePageGone);

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
            await page.goto(startUrl, { waitUntil: "domcontentloaded" }).catch(ignorePageGone);
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
            await context.close().catch(ignorePageGone);
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
    await browser.close().catch(ignorePageGone);
  }
}
