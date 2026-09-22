import { readdirSync, statSync, type Dirent } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Page } from "@playwright/test";
import type { Block, Checkpoint, WaygraphInstanceOption } from "./types.js";
import { discoverGraph, type WaygraphGraph, type WaygraphEdge } from "./graph.js";
import { exploreRoots, injectTaggedFile } from "./block-inject.js";

export interface ExploreContextOpts {
  blocksSelect?: import("./blocks-select.js").BlocksSelect;
  /** Absolute paths of extra Block trees to merge (host projectDir is always first). */
  inject?: string[];
}

export interface BlockEntry {
  block: Block<Checkpoint<string>, Checkpoint<string>>;
  exportName: string;
  file: string;
  kind: "nav" | "action";
  description: string;
}

/**
 * One menu row. Usually just a `WaygraphEdge` as discovered statically; when
 * a Block declares `instanceOptions`, one `ExploreEdge` is produced per live
 * option instead of a single generic row - `label` overrides the default
 * "block -> checkpoint" text, and `instanceOption` is what the runner
 * `mem.set()`s before running that row's Block.
 */
export interface ExploreEdge extends WaygraphEdge {
  label?: string;
  instanceOption?: WaygraphInstanceOption;
}

export interface ExploreSection {
  title: string;
  edges: ExploreEdge[];
}

/** Grouped menu for auto explore — `flat` preserves pick indices for CLI/headful. */
export interface ExploreMenu {
  here: string | null;
  sections: ExploreSection[];
  flat: ExploreEdge[];
}

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

/**
 * Real, confirmed bug this fixes: a bare `import(url.href)` is permanently
 * cached by Node's ESM loader for the lifetime of the process, keyed on the
 * exact specifier. `AutoSession.reloadLibrary()` exists specifically so a
 * Block edited on disk mid-session takes effect without restarting the
 * session - but a SECOND `reload` of a file already imported once in this
 * process silently kept returning the FIRST version's content, no matter
 * how many times the file changed on disk after that. A one-shot CLI
 * process (`waygraph graph`, etc.) never hits this - it only ever imports
 * each file once anyway - but a long-running `--detach` session calling
 * `reloadLibrary()` repeatedly does.
 *
 * Fix: bust the cache with the file's own mtime as a query param - a
 * genuinely changed file gets a new specifier (forcing a fresh import); an
 * UNCHANGED file between two reloads keeps hitting the SAME specifier (no
 * unbounded accumulation of dead module instances across many reloads).
 */
async function importModule(filePath: string): Promise<Record<string, unknown>> {
  const resolved = resolve(filePath);
  const url = new URL(`file://${resolved}`);
  const mtimeMs = statSync(resolved).mtimeMs;
  url.searchParams.set("t", String(mtimeMs));
  return (await import(url.href)) as Record<string, unknown>;
}

function isBlockLike(val: unknown): val is Block<Checkpoint<string>, Checkpoint<string>> & { description?: string } {
  if (val === null || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  if (typeof obj.name !== "string") return false;
  const instruction = obj.instruction as Record<string, unknown> | undefined;
  return instruction !== null && typeof instruction === "object" && typeof instruction?.act === "function";
}

function isNavBlockMarked(val: unknown): boolean {
  const kind = (val as { __waygraphKind?: string }).__waygraphKind;
  return kind === "nav" || kind === "page";
}

function isUrlNav(entry: BlockEntry): boolean {
  return (entry.block as { __waygraphNavClick?: unknown }).__waygraphNavClick === undefined;
}

function isBackEdge(edge: WaygraphEdge): boolean {
  return /^nav-back/.test(edge.block) || edge.block === "submit-logout";
}

async function navRunnable(page: Page, entry: BlockEntry): Promise<boolean> {
  const click = (entry.block as { __waygraphNavClick?: string | ((mem: unknown) => string) }).__waygraphNavClick;
  if (click === undefined) return true;
  if (typeof click !== "string") return false;
  try {
    // Short timeout: menu scan must stay snappy (many edges miss on this page).
    return await page.locator(click).first().isVisible({ timeout: 150 });
  } catch {
    return false;
  }
}

async function wildcardActionRunnable(page: Page, entry: BlockEntry, here: string | null): Promise<boolean> {
  if (here === null) return false;
  const name = entry.block.name;
  // Bulk / non-instance * actions: show when matching live buttons exist.
  try {
    if (name === "add-all-to-cart" || name === "add-to-cart") {
      return await page.locator('button[data-test^="add-to-cart-"]').first().isVisible({ timeout: 150 });
    }
    if (name === "remove-all-from-cart" || name === "remove-from-cart") {
      return await page.locator('button[data-test^="remove-"]').first().isVisible({ timeout: 150 });
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Import every `*.block.ts` export keyed by runtime Block `.name`.
 */
export async function loadBlockLibrary(
  projectDir: string,
  opts?: ExploreContextOpts,
): Promise<{
  byName: Map<string, BlockEntry>;
  navBlocks: BlockEntry[];
}> {
  const { matchBlocksSelect } = await import("./blocks-select.js");
  const byName = new Map<string, BlockEntry>();
  const navBlocks: BlockEntry[] = [];
  const navSeen = new Set<string>();
  const select = opts?.blocksSelect;
  for (const root of exploreRoots(projectDir, opts?.inject)) {
    for (const file of walkDir(root, /\.block\.ts$/)) {
    const relFile = relative(root, file).replace(/\\/g, "/");
    const taggedFile = injectTaggedFile(projectDir, root, relFile);
    // Glob/bare: path filter before import. Regex: need block name — filter after.
    if (select && select.kind !== "regex" && !matchBlocksSelect(select, { relFile })) {
      continue;
    }
    let mod: Record<string, unknown>;
    try {
      mod = await importModule(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/second time|playwright/i.test(msg)) {
        console.error(`waygraph auto: skip ${relFile}: ${msg.split("\n")[0]}`);
      }
      continue;
    }
    for (const [exportName, exported] of Object.entries(mod)) {
      if (!isBlockLike(exported)) continue;
      if (
        select &&
        !matchBlocksSelect(select, { relFile, blockName: exported.name })
      ) {
        continue;
      }
      const kind = isNavBlockMarked(exported) ? "nav" : "action";
      const entry: BlockEntry = {
        block: exported as Block<Checkpoint<string>, Checkpoint<string>>,
        exportName,
        file: taggedFile,
        kind,
        description: typeof exported.description === "string" ? exported.description : "",
      };
      if (byName.has(exported.name)) {
        console.error(
          `waygraph: inject skipped duplicate Block name "${exported.name}" (${taggedFile})`,
        );
        continue;
      }
      byName.set(exported.name, entry);
      if (kind === "nav" && !navSeen.has(exported.name)) {
        navSeen.add(exported.name);
        navBlocks.push(entry);
      }
    }
    }
  }
  navBlocks.sort((a, b) => {
    const aUrl = isUrlNav(a) ? 0 : 1;
    const bUrl = isUrlNav(b) ? 0 : 1;
    return aUrl - bUrl || a.block.name.localeCompare(b.block.name);
  });
  return { byName, navBlocks };
}

/**
 * @deprecated Use {@link buildExploreMenu} — kept for unit tests.
 */
export function exploreChoices(graph: WaygraphGraph, here: string | null): WaygraphEdge[] {
  const seen = new Set<string>();
  const out: WaygraphEdge[] = [];
  for (const edge of graph.edges) {
    if (here === null) {
      if (edge.kind !== "nav") continue;
    } else if (edge.from !== here && edge.from !== "*") {
      continue;
    }
    if (seen.has(edge.block)) continue;
    seen.add(edge.block);
    out.push(edge);
  }
  return out.sort((a, b) => a.block.localeCompare(b.block));
}

/**
 * Runtime-filtered menu: only Blocks that can run on the live page, grouped forward/back.
 */
export async function buildExploreMenu(
  page: Page,
  graph: WaygraphGraph,
  library: { byName: Map<string, BlockEntry> },
  here: string | null,
): Promise<ExploreMenu> {
  const forward: ExploreEdge[] = [];
  const anywhere: ExploreEdge[] = [];
  const navigate: ExploreEdge[] = [];
  const back: ExploreEdge[] = [];
  const seen = new Set<string>();
  // Union Out tags create duplicate edges for the same Block - cache instanceOptions
  // so we only scrape the DOM once per Block name per menu build.
  const instanceOptionsCache = new Map<string, readonly WaygraphInstanceOption[]>();

  const push = (bucket: ExploreEdge[], edge: ExploreEdge) => {
    if (seen.has(edge.block)) return;
    seen.add(edge.block);
    bucket.push(edge);
  };

  async function loadInstanceOptions(
    entry: BlockEntry,
  ): Promise<readonly WaygraphInstanceOption[]> {
    const fn = entry.block.instanceOptions;
    if (!fn) return [];
    const cached = instanceOptionsCache.get(entry.block.name);
    if (cached) return cached;
    let options: readonly WaygraphInstanceOption[] = [];
    try {
      options = await fn(page);
    } catch {
      options = [];
    }
    instanceOptionsCache.set(entry.block.name, options);
    return options;
  }

  for (const edge of graph.edges) {
    const entry = library.byName.get(edge.block);
    if (!entry) continue;

    if (edge.kind === "action") {
      if (here !== null && edge.from === here) {
        if (entry.block.instanceOptions) {
          const options = await loadInstanceOptions(entry);
          for (const option of options) {
            const seenKey = `${edge.block}::${option.id}`;
            if (seen.has(seenKey)) continue;
            seen.add(seenKey);
            (isBackEdge(edge) ? back : forward).push({
              ...edge,
              label: option.label,
              instanceOption: option,
            });
          }
        } else {
          push(isBackEdge(edge) ? back : forward, edge);
        }
      } else if (here !== null && edge.from === "*") {
        if (entry.block.instanceOptions) {
          const options = await loadInstanceOptions(entry);
          for (const option of options) {
            const seenKey = `${edge.block}::${option.id}`;
            if (seen.has(seenKey)) continue;
            seen.add(seenKey);
            anywhere.push({ ...edge, label: option.label, instanceOption: option });
          }
        } else if (await wildcardActionRunnable(page, entry, here)) {
          const bulkLabel: Record<string, string> = {
            "add-all-to-cart": "Add all to cart",
            "remove-all-from-cart": "Remove all from cart",
          };
          const label =
            bulkLabel[entry.block.name] ?? (entry.description?.trim() || undefined);
          push(anywhere, label ? { ...edge, label } : edge);
        }
      }
      continue;
    }

    // Nav: MemNavBlock (instanceOptions) expands one row per live target;
    // plain NavBlock still uses click-visibility (navRunnable).
    if (here !== null && (edge.from === here || edge.from === "*") && edge.to !== here) {
      if (entry.block.instanceOptions) {
        const options = await loadInstanceOptions(entry);
        const bucket = isBackEdge(edge) ? back : navigate;
        for (const option of options) {
          const seenKey = `${edge.block}::${option.id}`;
          if (seen.has(seenKey)) continue;
          seen.add(seenKey);
          bucket.push({ ...edge, label: option.label, instanceOption: option });
        }
        continue;
      }
    }

    if (!(await navRunnable(page, entry))) continue;

    if (here === null) {
      // Bootstrap only: URL deep-links as "Start here". Click-nav needs a live
      // control so it cannot seed an unknown page.
      if (!isUrlNav(entry)) continue;
      push(navigate, edge);
      continue;
    }

    if (edge.to === here) continue;

    // Known screen: do NOT dump every defineNavBlock({ url }) under Navigate.
    // Graph still marks NavBlocks from:"*" for pathfinding/traverse; auto menu
    // only offers click-nav whose control is visible on this page (navRunnable).
    // Otherwise LoginForm lists every app route + mailpit as if legal moves.
    if (isUrlNav(entry)) continue;

    if (isBackEdge(edge) && (edge.from === here || edge.from === "*")) {
      push(back, edge);
    } else if (edge.from === here || edge.from === "*") {
      push(navigate, edge);
    }
  }

  const sections: ExploreSection[] = [];
  if (here === null) {
    if (navigate.length > 0) {
      sections.push({ title: "Start here", edges: navigate.sort((a, b) => a.block.localeCompare(b.block)) });
    }
  } else {
    if (forward.length > 0) {
      sections.push({
        title: `Methods from ${here}`,
        edges: forward.sort((a, b) => a.block.localeCompare(b.block)),
      });
    }
    if (anywhere.length > 0) {
      sections.push({
        title: "Also on this page",
        edges: anywhere.sort((a, b) => (a.label ?? a.block).localeCompare(b.label ?? b.block)),
      });
    }
    if (navigate.length > 0) {
      sections.push({
        title: "Navigate",
        edges: navigate.sort((a, b) => (a.label ?? a.block).localeCompare(b.label ?? b.block)),
      });
    }
    if (back.length > 0) {
      sections.push({
        title: "Go back",
        edges: back.sort((a, b) => a.block.localeCompare(b.block)),
      });
    }
  }

  const flat = sections.flatMap((s) => s.edges);

  // Stuck screen: graph knows actions from `here` but none made it into the menu
  // (failed library load, empty instanceOptions, etc.). Surface them so LoginPage
  // never shows a dead "No moves" when submit-login is in the graph.
  if (here !== null && flat.length === 0) {
    const rescue: ExploreEdge[] = [];
    const rescued = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.kind !== "action" || edge.from !== here) continue;
      if (rescued.has(edge.block)) continue;
      const entry = library.byName.get(edge.block);
      if (!entry) continue;
      if (entry.block.instanceOptions) continue; // still need live rows
      rescued.add(edge.block);
      rescue.push(edge);
    }
    if (rescue.length > 0) {
      sections.push({
        title: `Methods from ${here}`,
        edges: rescue.sort((a, b) => a.block.localeCompare(b.block)),
      });
      return { here, sections, flat: sections.flatMap((s) => s.edges) };
    }
  }

  return { here, sections, flat };
}

export async function buildExploreContext(
  projectDir: string,
  opts?: ExploreContextOpts,
): Promise<{
  graph: WaygraphGraph;
  library: Awaited<ReturnType<typeof loadBlockLibrary>>;
}> {
  // Sequential: parallel import of the same *.block.ts tree raced Playwright's
  // dual-copy guard in some installs and left graph edges without library entries
  // (LoginPage → "No moves").
  const library = await loadBlockLibrary(projectDir, opts);
  const graph = await discoverGraph(projectDir, opts);
  return { graph, library };
}
