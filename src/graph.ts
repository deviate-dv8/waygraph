import { existsSync, readFileSync, readdirSync, type Dirent } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";

/**
 * The state-machine shape `waygraph auto` discovers from a project's own
 * Blocks - Checkpoints are nodes, Blocks are edges. Kept as plain data (not
 * classes/functions) so it's trivially JSON-serializable for a script/agent
 * reading `waygraph auto`'s stdout.
 */
export interface WaygraphNode {
  checkpoint: string;
}

export interface WaygraphEdge {
  /** The Block's own runtime `.name`. */
  block: string;
  /** Path the Block was discovered in, relative to the project root. */
  file: string;
  /** `"*"` for a NavBlock - reachable from anywhere, by design. */
  from: string;
  to: string;
  kind: "nav" | "action";
}

export interface SkippedBlock {
  block: string;
  file: string;
  reason: string;
}

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

// ---------------------------------------------------------------------------
// Discovery - deliberately self-contained (no import from cli.ts): cli.ts
// runs its own main() unconditionally at module load, so it can't safely be
// imported from a test (or from here) without also running the whole CLI.
// These are small, stable duplicates of cli.ts's own discoverBlocks/
// isBlockLike/isNavBlockMarked/importModule, not a shared abstraction -
// simpler and lower-risk than a circular import between the two modules.
// ---------------------------------------------------------------------------

function walkDir(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
      results.push(...walkDir(full, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function discoverBlocks(projectDir: string): string[] {
  return walkDir(projectDir, /\.block\.ts$/);
}

function discoverFlows(projectDir: string): string[] {
  return walkDir(projectDir, /\.flow\.ts$/);
}

/** Block export ids listed inside any `defineFlow([...])` array in flow files. */
function extractFlowBlockRefs(flowSrc: string): string[] {
  const refs: string[] = [];
  const re = /defineFlow(?:<[\s\S]*?>)?\s*\(\s*\[([\s\S]*?)\]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flowSrc)) !== null) {
    for (const part of m[1]!.split(",")) {
      const trimmed = part.trim().replace(/\/\/.*$/, "").trim();
      const id = trimmed.split(/\s+/)[0];
      if (!id || id === "start" || id === "end") continue;
      refs.push(id);
    }
  }
  return refs;
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

async function importModule(filePath: string): Promise<Record<string, unknown>> {
  const url = new URL(`file://${resolve(filePath)}`);
  return (await import(url.href)) as Record<string, unknown>;
}

function isBlockLike(val: unknown): val is { name: string; instruction: { act: unknown; resolve: unknown } } {
  if (val === null || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  if (typeof obj.name !== "string") return false;
  const instruction = obj.instruction as Record<string, unknown> | undefined;
  return instruction !== null && typeof instruction === "object" && typeof instruction?.act === "function";
}

/** Set by `defineNavBlock` (non-enumerable) - see src/engine.ts. */
function isNavBlockMarked(val: Record<string, unknown>): boolean {
  const kind = (val as { __waygraphKind?: string }).__waygraphKind;
  return kind === "nav" || kind === "page";
}

/**
 * Resolves `typeName` to every literal Checkpoint tag it can mean, within
 * one `*.states.ts` file's own source text - `type X = Checkpoint<"Tag">`
 * directly, or `type X = A | B | Checkpoint<"C">` (a union of other type
 * names and/or inline Checkpoint literals) recursively. A cycle or unknown
 * identifier just contributes no tags, rather than throwing - callers treat
 * an empty result as "couldn't resolve," not a crash.
 */
function resolveCheckpointTags(statesSrc: string, typeName: string, seen: Set<string> = new Set()): string[] {
  if (seen.has(typeName)) return [];
  seen.add(typeName);
  const direct = new RegExp(`type\\s+${typeName}\\s*=\\s*Checkpoint<"([^"]+)">`).exec(statesSrc);
  if (direct) return [direct[1]!];
  const aliased = new RegExp(`type\\s+${typeName}\\s*=\\s*([^;]+);`).exec(statesSrc);
  if (!aliased) return [];
  const tags: string[] = [];
  for (const member of aliased[1]!.split("|").map((s) => s.trim()).filter(Boolean)) {
    const inline = /^Checkpoint<"([^"]+)">$/.exec(member);
    if (inline) {
      tags.push(inline[1]!);
    } else if (/^[A-Za-z_$][\w]*$/.test(member)) {
      tags.push(...resolveCheckpointTags(statesSrc, member, seen));
    }
  }
  return tags;
}

/**
 * Finds which file `blockFilePath`'s own `import type { ... }` statements
 * say `typeName` comes from, resolved to a real path on disk (`.js` ->
 * `.ts`, matching this project's own NodeNext import convention). Only
 * follows relative imports - `typeName` imported from a package (e.g.
 * `waygraph` itself, for `Checkpoint`) has no project file to read.
 */
function findTypeSourceFile(blockFilePath: string, typeName: string): string | null {
  const src = readFileSync(blockFilePath, "utf-8");
  const importRe = /import\s+type\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(src)) !== null) {
    const names = m[1]!.split(",").map((s) => s.trim());
    if (!names.includes(typeName)) continue;
    const importPath = m[2]!;
    if (!importPath.startsWith(".")) continue;
    const resolved = join(dirname(blockFilePath), importPath.replace(/\.js$/, ".ts"));
    if (existsSync(resolved)) return resolved;
  }
  return null;
}

/** `findTypeSourceFile` + `resolveCheckpointTags`, chained - `[]` on any failure along the way. */
function resolveTypeToTags(blockFilePath: string, typeName: string): string[] {
  const statesFile = findTypeSourceFile(blockFilePath, typeName);
  if (!statesFile) return [];
  return resolveCheckpointTags(readFileSync(statesFile, "utf-8"), typeName);
}

/**
 * Resolves one `defineBlock<In, Out>` generic argument, as captured by
 * `extractDefineBlockGenerics` - either a plain type identifier (goes
 * through `resolveTypeToTags`), an inline `Checkpoint<"Tag">` literal, or
 * the documented wildcard forms `Checkpoint<string>`/`Checkpoint<any>` (a
 * Block reused across several entry points, e.g. this project's own
 * `AddToCartBlock` - reachable from anywhere, same as a NavBlock's own `"*"`).
 */
function resolveGenericArg(blockFilePath: string, arg: string): string[] {
  if (arg === "Checkpoint<string>" || arg === "Checkpoint<any>") return ["*"];
  const inline = /^Checkpoint<"([^"]+)">$/.exec(arg);
  if (inline) return [inline[1]!];
  return resolveTypeToTags(blockFilePath, arg);
}

/** Every `defineBlock` / `defineEffectBlock` / `defineMemEffectBlock` `<In, Out>` call site. */
function extractDefineBlockGenerics(src: string): { in: string; out: string }[] {
  // Each argument is either a plain identifier or an inline `Checkpoint<...>`
  // (its own angle brackets, so the outer defineX<...> pair alone won't
  // balance correctly against a naive greedy match) - captured as a single
  // alternation so both shapes come out of the same two capture groups.
  // Effect helpers are TypeScript salt over defineBlock - same In/Out edges.
  const arg = String.raw`(Checkpoint<[^>]*>|[A-Za-z_$][\w]*)`;
  const re = new RegExp(
    String.raw`define(?:(?:Mem)?Effect|Method|Action)?Block<\s*${arg}\s*,\s*${arg}\s*>`,
    "g",
  );
  // Matches: defineBlock | defineMethodBlock | defineActionBlock | defineEffectBlock |
  // defineMemEffectBlock (Nav / NavClick / Page use runtime markers, not this regex.)
  const calls: { in: string; out: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    calls.push({ in: m[1]!, out: m[2]! });
  }
  return calls;
}

/**
 * Walks every `*.block.ts` file under `projectDir` and builds the app's own
 * state graph. Shares the same in-process-import limitation `waygraph
 * check` already has: a target project whose own `waygraph`/`playwright`
 * are genuinely separate installs (not symlinked into this same
 * node_modules resolution) can crash Playwright's own "second copy" guard
 * on import - acceptable for an introspection command the same way it
 * already is for `check`, unlike `chain`, which spawns a child process
 * specifically because it also EXECUTES Blocks, not just imports them.
 */
export async function discoverGraph(projectDir: string): Promise<WaygraphGraph> {
  const files = discoverBlocks(projectDir);
  const nodeTags = new Set<string>();
  const edges: WaygraphEdge[] = [];
  const skipped: SkippedBlock[] = [];

  for (const file of files) {
    const relFile = relative(projectDir, file);
    let mod: Record<string, unknown>;
    try {
      mod = await importModule(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Dual @playwright/test installs fail here - surface instead of empty graph.
      if (/second time|playwright/i.test(msg)) {
        console.error(`waygraph graph: skip ${relFile}: ${msg.split("\n")[0]}`);
      }
      continue;
    }
    const src = readFileSync(file, "utf-8");
    // Assumes source order matches export-object iteration order - true for
    // this codebase's own convention of one Block per file; a file with
    // several regular Blocks in an unusual order is a known edge case, not
    // handled specially here.
    const calls = extractDefineBlockGenerics(src);
    let callIndex = 0;

    for (const exported of Object.values(mod)) {
      if (!isBlockLike(exported)) continue;
      const blockName = exported.name;

      if (isNavBlockMarked(exported as Record<string, unknown>)) {
        try {
          // NavBlock / PageBlock resolve() ignores input - always checkpoint(tag).
          const resolveFn = exported.instruction.resolve as (input: unknown) => Promise<{ __state: string }> | { __state: string };
          const resolved = await resolveFn(undefined);
          const to = resolved.__state;
          nodeTags.add(to);
          // Arrival-only Page hubs register the Checkpoint node but do not emit
          // a Start-here edge (no deep link). Methods own the action edges.
          const isPage = (exported as { __waygraphKind?: string }).__waygraphKind === "page";
          const deepLink =
            !isPage ||
            (exported as { __waygraphPageDeepLink?: boolean }).__waygraphPageDeepLink === true;
          if (deepLink) {
            edges.push({ block: blockName, file: relFile, from: "*", to, kind: "nav" });
          }
        } catch {
          skipped.push({ block: blockName, file: relFile, reason: "NavBlock/PageBlock resolve() threw" });
        }
        continue;
      }

      const call = calls[callIndex++];
      if (!call) {
        skipped.push({
          block: blockName,
          file: relFile,
          reason: "no defineBlock/defineMethodBlock/defineEffectBlock<In, Out> generic call found",
        });
        continue;
      }
      const fromTags = resolveGenericArg(file, call.in);
      const toTags = resolveGenericArg(file, call.out);
      if (fromTags.length === 0 || toTags.length === 0) {
        const badName = fromTags.length === 0 ? call.in : call.out;
        skipped.push({ block: blockName, file: relFile, reason: `couldn't resolve "${badName}" to a Checkpoint tag` });
        continue;
      }
      for (const from of fromTags) {
        for (const to of toTags) {
          if (from !== "*") nodeTags.add(from);
          nodeTags.add(to);
          edges.push({ block: blockName, file: relFile, from, to, kind: "action" });
        }
      }
    }
  }

  return {
    nodes: [...nodeTags].sort().map((checkpoint) => ({ checkpoint })),
    edges,
    skipped,
  };
}
