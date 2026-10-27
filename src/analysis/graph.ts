import { relative } from "node:path";
import type { BlocksSelect } from "../manifest/select.js";
import { scanProject } from "../manifest/project.js";
import type { ProjectScan } from "../manifest/project.js";
import type { BlockInfo } from "../engine/flow/flow.js";

/**
 * The state-machine shape `waygraph auto` discovers from a project's own
 * Blocks - Checkpoints are nodes, Blocks are edges. Kept as plain data (not
 * classes/functions) so it's trivially JSON-serializable for a script/agent
 * reading `waygraph auto`'s stdout.
 */
export interface WaygraphNode {
  checkpoint: string;
}

/** A move in the graph: a Block from one Checkpoint tag to another. */
export interface WaygraphEdge {
  /** The Block's own runtime `.name`. */
  block: string;
  /** Path the Block was discovered in, relative to the project root. */
  file: string;
  /** `"*"` for a NavBlock - reachable from anywhere, unless it declares `from` (then one edge per tag). */
  from: string;
  to: string;
  kind: "nav" | "action";
}

/** A Block `waygraph graph` found but could not place in the graph, with the reason. */
export interface SkippedBlock {
  block: string;
  file: string;
  reason: string;
}

/** The static graph of a project: Checkpoint nodes, Block edges, skipped and orphan Blocks. */
export interface WaygraphGraph {
  nodes: WaygraphNode[];
  edges: WaygraphEdge[];
  /** Blocks whose Out tag couldn't be statically resolved - not a crash, just excluded. */
  skipped: SkippedBlock[];
}

/** A Block export that no `.flow.ts` uses yet. */
export interface OrphanBlock {
  /** Export identifier in the `.block.ts` file. */
  exportName: string;
  /** Runtime Block `.name` when import succeeds; else derived from export. */
  block: string;
  /** Path relative to the project root. */
  file: string;
}

/**
 * Renders a `WaygraphGraph` as Mermaid `stateDiagram-v2` text - paste
 * straight into a `.md` file's ```mermaid fence or a live editor. `"*"`
 * renders as Mermaid's own `[*]` start marker, matching how a NavBlock's
 * `from` already means "reachable from anywhere."
 * @example console.log(toMermaid(graph))
 */
export function toMermaid(graph: WaygraphGraph): string {
  const lines = ["stateDiagram-v2"];
  for (const edge of graph.edges) {
    const from = edge.from === "*" ? "[*]" : edge.from;
    lines.push(`  ${from} --> ${edge.to} : ${edge.block}`);
  }
  return lines.join("\n");
}

/**
 * Blocks the project exports but no flow plays. Read at runtime: every flow's `blocks()` (nested flows flattened, the
 * Blocks inside a fast-forward or composed step, and the Blocks a `branch()` routes to) against every scanned Block. Page hubs and the Blocks a Page lists as its
 * `methods` are not orphans.
 */
export async function findOrphanBlocks(projectDir: string): Promise<OrphanBlock[]> {
  const scan = await scanProject(projectDir, { maps: false });
  const used = new Set<string>();
  // A fast-forward or composed step is one Block made of others: those are played too.
  const note = (infos: readonly BlockInfo[]): void => {
    for (const info of infos) {
      used.add(info.name);
      for (const target of Object.values(info.routes ?? {})) if (target) used.add(target);
      const inner = (info.block as { steps?: () => readonly BlockInfo[] } | undefined)?.steps;
      if (typeof inner === "function") note(inner.call(info.block));
    }
  };
  for (const { flow } of scan.flows) note(flow.blocks() as BlockInfo[]);
  for (const b of scan.blocks) {
    if (b.kind !== "page") continue;
    for (const name of (b.block as { __waygraphMethods?: readonly string[] }).__waygraphMethods ?? []) used.add(name);
  }
  return scan.blocks
    .filter((b) => b.kind !== "page" && !used.has(b.name))
    .map((b) => ({ exportName: b.exportName, block: b.name, file: relative(projectDir, b.absFile) }))
    .sort((a, b) => a.file.localeCompare(b.file) || a.exportName.localeCompare(b.exportName));
}

/**
 * Shortest Block-name path between two Checkpoint tags using `discoverGraph`
 * edges. NavBlocks (`from: "*"`) count from any state.
 */
export function findBlockPath(graph: WaygraphGraph, fromTag: string, toTag: string): string[] | null {
  if (fromTag === toTag) return [];
  type QueueItem = { tag: string; path: string[] };
  const queue: QueueItem[] = [{ tag: fromTag, path: [] }];
  const visited = new Set<string>([fromTag]);

  while (queue.length > 0) {
    const { tag, path } = queue.shift()!;
    for (const edge of graph.edges) {
      if (edge.from !== tag && edge.from !== "*") continue;
      const nextPath = [...path, edge.block];
      if (edge.to === toTag) return nextPath;
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push({ tag: edge.to, path: nextPath });
      }
    }
  }
  return null;
}

export interface BlockPathStep {
  block: string;
  /** The specific Checkpoint this hop's edge targets - NOT re-derivable by
   * looking up `block` by name afterward, since a union-Out Block (e.g.
   * "Union Out tags create duplicate edges for the same Block", see
   * `discoverGraph`'s own comment above) can have several edges with the
   * same `block` name but different `to` tags; only the specific edge BFS
   * actually routed through here is correct. */
  to: string;
}

/**
 * Same BFS as `findBlockPath`, but returns each hop's specific edge (block
 * name + the Checkpoint it targets), not just the block name - needed by any
 * caller that must verify a step actually landed where the route intended,
 * not just re-guess it afterward. `findBlockPath` itself is unchanged and
 * still used wherever only the block-name sequence matters.
 */
export function findBlockPathDetailed(graph: WaygraphGraph, fromTag: string, toTag: string): BlockPathStep[] | null {
  if (fromTag === toTag) return [];
  type QueueItem = { tag: string; path: BlockPathStep[] };
  const queue: QueueItem[] = [{ tag: fromTag, path: [] }];
  const visited = new Set<string>([fromTag]);

  while (queue.length > 0) {
    const { tag, path } = queue.shift()!;
    for (const edge of graph.edges) {
      if (edge.from !== tag && edge.from !== "*") continue;
      const nextPath = [...path, { block: edge.block, to: edge.to }];
      if (edge.to === toTag) return nextPath;
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push({ tag: edge.to, path: nextPath });
      }
    }
  }
  return null;
}





/**
 * The project's state graph: Checkpoints are nodes, Blocks are edges. Built from the manifest scan, which reads each Block's
 * route at runtime.
 */
export async function discoverGraph(
  projectDir: string,
  opts?: { blocksSelect?: BlocksSelect; inject?: string[] },
): Promise<WaygraphGraph> {
  const scan = await scanProject(projectDir, { blocksSelect: opts?.blocksSelect, inject: opts?.inject, flows: false });
  return graphFromScan(scan);
}

/** The graph of an existing scan. */
export function graphFromScan(scan: ProjectScan): WaygraphGraph {
  const nodeTags = new Set<string>();
  const edges: WaygraphEdge[] = [];
  const seen = new Set<string>();
  for (const b of scan.blocks) {
    if (b.to.length === 0) continue;
    // Arrival-only Page hubs register the Checkpoint but are not a way to get there; a deep-linking Page is.
    if (b.kind === "page" && (b.block as { __waygraphPageDeepLink?: boolean }).__waygraphPageDeepLink !== true) {
      for (const to of b.to) nodeTags.add(to);
      continue;
    }
    const kind = b.kind === "nav" || b.kind === "page" ? "nav" : "action";
    for (const from of b.from) {
      for (const to of b.to) {
        if (from !== "*") nodeTags.add(from);
        nodeTags.add(to);
        const key = `${b.name}\0${from}\0${to}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ block: b.name, file: b.file, from, to, kind });
      }
    }
  }
  return {
    nodes: [...nodeTags].sort().map((checkpoint) => ({ checkpoint })),
    edges,
    skipped: scan.skipped,
  };
}
