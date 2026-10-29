// One traverse worker: its own context and mem, walking unused legal edges (leased so parallel workers never share
// one) until a leaf, a budget limit or the first broken edge.
import { missingMemKeys, seedDefaultMem } from "../auto/mem.js";
import { messageOf } from "../../engine/errors.js";
import type { BrowserContext, Page } from "@playwright/test";
import type { WaygraphGraph } from "../../analysis/graph.js";
import { Engine } from "../../engine/engine.js";
import { MemPage } from "../../engine/mem/mem.js";
import { ignorePageGone } from "../../engine/page-gone.js";
import { inRun } from "../../engine/run/events.js";
import type { BlockEntry } from "../../manifest/project.js";
import { detectHere, runOneBlock } from "../auto/auto.js";
import { buildExploreContext, buildExploreMenu, type ExploreEdge } from "../auto/explore.js";
import { EdgeLeaseCoordinator } from "./lease.js";
import type { TraverseWorkerResult } from "./traverse.js";


export function snapshotMem(
  library: Map<string, BlockEntry>,
  mem: MemPage): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const entry of library.values()) {
    for (const k of entry.block.requires ?? []) {
      if (mem.has(k) && !(k.name in out)) {
        out[k.name] = mem.get(k);
      }
    }
  }
  return out;
}
export function restoreMem(
  library: Map<string, BlockEntry>,
  mem: MemPage,
  snap: Record<string, unknown>,
  dataJson?: string): void {
  seedDefaultMem(library, mem, dataJson);
  for (const entry of library.values()) {
    for (const k of entry.block.requires ?? []) {
      if (k.name in snap) {
        mem.set(k, snap[k.name]);
      }
    }
  }
}
export function ensureMem(entry: BlockEntry, mem: MemPage): void {
  const missing = missingMemKeys(entry, mem);
  if (missing.length === 0) return;
  throw new Error(
    `Block "${entry.block.name}" needs Mem keys: ${missing.map((k) => k.name).join(", ")} ` +
    `(pass --data '{...}' or WAYGRAPH_DATA)`
  );
}
export function edgeKey(edge: ExploreEdge): string {
  const id = edge.instanceOption?.id;
  return id ? `${edge.block}::${id}` : edge.block;
}
export interface WorkerOpts {
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
/** One worker's walk, as one run of its own (parallel workers never share a run id or step counter). */
export function runTraverseWorker(opts: WorkerOpts): Promise<TraverseWorkerResult> {
  return inRun(`traverse ${opts.traverseId} worker ${opts.workerIndex}`, () => walk(opts), (r) => r.leaf);
}

async function walk(opts: WorkerOpts): Promise<TraverseWorkerResult> {
  const {
    traverseId, workerIndex, parallel, maxSteps, maxVisitsPerNode, maxVisitsPerEdge, timeoutMs, graph, library, engine, context, mem, leases,
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
    for (; ;) {
      if (Date.now() - startedAt > timeoutMs) {
        console.log(
          `[Killed timeout[${traverseId}] node=${lastHere ?? "?"} wallMs=${timeoutMs}]`
        );
        exitCode = 1;
        break;
      }
      if (steps >= maxSteps) {
        console.log(
          `[Killed max-steps[${traverseId}] node=${lastHere ?? "?"} steps=${steps} max=${maxSteps}]`
        );
        exitCode = 1;
        break;
      }

      if (page.isClosed()) {
        page = await context.newPage();
        if (startUrl) {
          await page.goto(startUrl, { waitUntil: "domcontentloaded" }).catch(ignorePageGone);
        }
      }

      const detected = await detectHere(page, library.navBlocks);
      const here = lastHere ?? detected ?? opts.from ?? null;

      if (here && (nodeVisits.get(here) ?? 0) >= maxVisitsPerNode) {
        console.log(
          `[Killed loop[${traverseId}] node=${here} visits=${nodeVisits.get(here)} max=${maxVisitsPerNode}]`
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
          `waygraph traverse[${traverseId}]: PASS leaf edgesHit=${edgesHit.size} steps=${steps}`
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
          `[Broke at edge[${traverseId}] block=${pick.block} from=${here ?? "?"} to=${pick.to} reason=not-loaded]`
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
          (pick.label ? ` (${pick.label})` : "")
        );

        const out = await runOneBlock(engine, entry, context, page, mem, false);
        const observed = typeof out === "object" && out && "__state" in out
          ? String((out as { __state: string; }).__state)
          : pick.to;

        edgeVisits.set(key, (edgeVisits.get(key) ?? 0) + 1);
        edgesHit.add(key);
        if (here) nodeVisits.set(here, (nodeVisits.get(here) ?? 0) + 1);
        lastHere = observed;
        steps += 1;

        if (observed !== pick.to && pick.to !== "*") {
          console.error(
            `waygraph traverse[${traverseId}]: WARN static to=${pick.to} observed=${observed}`
          );
        }
      } catch (err) {
        const msg = messageOf(err);
        console.log(
          `[Broke at edge[${traverseId}] block=${pick.block} from=${fromLabel} to=${pick.to}] ${msg}`
        );
        exitCode = 1;
        break;
      }
    }
  } finally {
    console.error(
      `waygraph traverse[${traverseId}]: done exit=${exitCode} steps=${steps} edgesHit=${edgesHit.size}`
    );
  }
  return {
    exitCode,
    steps,
    edgesHit: [...edgesHit],
    ...(leaf ? { leaf } : {}),
  };
}
