import { readFileSync } from "node:fs";
import { relative } from "node:path";
import type { BlocksSelect } from "../manifest/select.js";
import { scanProject } from "../manifest/project.js";
import type { ProjectScan } from "../manifest/project.js";
import { importFresh, isBlockLike, walkDir } from "../manifest/scan.js";

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

/** A Block export that no `.flow.ts` defineFlow array references yet. */
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

const discoverBlocks = (projectDir: string): string[] => walkDir(projectDir, /\.block\.ts$/);
const discoverFlows = (projectDir: string): string[] => walkDir(projectDir, /\.flow\.ts$/);
const importModule = importFresh;

/** Block export ids a flow file uses: every identifier outside its import lines (a Block can sit in the array or in a local like `const AddShown = AddBlock.stubAfter(...)`). */
function extractFlowBlockRefs(flowSrc: string): string[] {
  const body = flowSrc.replace(/^\s*import[\s\S]*?;\s*$/gm, "").replace(/\/\/.*$/gm, "");
  return body.match(/[A-Za-z_$][\w$]*/g) ?? [];
}

function exportNameToBlockName(exportName: string): string {
  const base = exportName.replace(/Block$/, "");
  return base
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/**
 * Blocks present on disk but never wired into a `.flow.ts` defineFlow array.
 * Required before `chain auto` can build a path from the discovered graph -
 * orphan Blocks are intentionally excluded from auto shorthand. Arrival-only
 * Page hubs and Blocks listed on a Page's `methods` are not orphans.
 */
export async function findOrphanBlocks(projectDir: string): Promise<OrphanBlock[]> {
  const blockFiles = discoverBlocks(projectDir);
  const flowFiles = discoverFlows(projectDir);
  const referenced = new Set<string>();
  for (const flowFile of flowFiles) {
    for (const ref of extractFlowBlockRefs(readFileSync(flowFile, "utf-8"))) {
      referenced.add(ref);
    }
  }

  const pageMethodNames = new Set<string>();
  for (const file of blockFiles) {
    let mod: Record<string, unknown>;
    try {
      mod = await importModule(file);
    } catch {
      continue;
    }
    for (const exported of Object.values(mod)) {
      if (!exported || typeof exported !== "object") continue;
      if ((exported as { __waygraphKind?: string }).__waygraphKind !== "page") continue;
      const names = (exported as { __waygraphMethods?: readonly string[] }).__waygraphMethods;
      if (Array.isArray(names)) {
        for (const n of names) pageMethodNames.add(n);
      }
    }
  }

  const orphans: OrphanBlock[] = [];
  for (const file of blockFiles) {
    const relFile = relative(projectDir, file);
    const src = readFileSync(file, "utf-8");
    const exportRe = /export\s+const\s+([A-Za-z_$][\w]*)\s*=/g;
    let m: RegExpExecArray | null;
    while ((m = exportRe.exec(src)) !== null) {
      const exportName = m[1]!;
      if (referenced.has(exportName)) continue;
      if (!/defineBlock|defineMethodBlock|defineActionBlock|definePageBlock|defineEffectBlock|defineMemEffectBlock|defineNavBlock|defineNavClickBlock|defineMemNavBlock/.test(src)) continue;
      // Arrival-only Page hubs are never orphans (even if import fails without tsx).
      const assignSlice = src.slice(m.index, m.index + exportName.length + 80);
      if (/=\s*definePageBlock\b/.test(assignSlice)) continue;
      let block = exportNameToBlockName(exportName);
      try {
        const mod = await importModule(file);
        const exported = mod[exportName];
        if (isBlockLike(exported)) block = exported.name;
        if (
          exported &&
          typeof exported === "object" &&
          (exported as { __waygraphKind?: string }).__waygraphKind === "page"
        ) {
          continue;
        }
        if (pageMethodNames.has(block)) continue;
      } catch {
        // import may fail in partial projects - keep derived name
      }
      orphans.push({ exportName, block, file: relFile });
    }
  }
  return orphans.sort((a, b) => a.file.localeCompare(b.file) || a.exportName.localeCompare(b.exportName));
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
 * route at runtime (or, for the deprecated `<In, Out>` form, from source).
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
