// Loads a project's layouts (`_layout.block.ts`) and works out what each covers: the pages whose Nav or Page Block lives
// in its folder or below (or its `on`), the page above each (for `to: "parent"` links) and where its Read applies.
// `run`, `demo`, `waygraph test` and the sessions load them, as they load Read Blocks and accounts.
import { readFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { envString } from "../engine/env.js";
import { isLayout, layoutState, type defineLayout } from "../engine/block/kinds/layout.js";
import { setTrails } from "../engine/trait/trails.js";
import { reportImportError, scanProject } from "./project.js";
import { walkDir } from "./scan.js";
import { pageUrls } from "./urls.js";
import { ancestorPages, parentPage, siteTree, type SiteTree } from "./site-map.js";

const LAYOUT_FILE = /^_layout\.block\.ts$/;
/** Where a page that covers others can be: any Page Block file. */
const SHELL_FILE = /(?:^|[\\/.])(?:_?layout|_?page)\.block\.ts$/;

/** A layout as loading found it: what it covers, from where. */
export interface LoadedLayout {
  name: string;
  file: string;
  covers: string[];
}

/** The pages under `dir`: the Checkpoints its Nav and Page Blocks land on (a layout's own links aren't pages of it). */
async function pagesUnder(dir: string, projectDir: string): Promise<string[]> {
  const pages = new Set<string>();
  for (const file of walkDir(dir, /\.block\.ts$/)) {
    if (LAYOUT_FILE.test(file.split(/[\\/]/).pop() ?? "")) continue;
    let mod: Record<string, unknown>;
    try {
      mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    } catch (err) {
      reportImportError(relative(projectDir, file), err);
      continue;
    }
    for (const value of Object.values(mod)) {
      const block = value as { __waygraphKind?: string; __waygraphTo?: string[]; __waygraphLayout?: unknown } | null;
      if (!block || typeof block !== "object" || block.__waygraphLayout) continue;
      if (block.__waygraphKind === "nav" || block.__waygraphKind === "page") for (const tag of block.__waygraphTo ?? []) if (tag !== "*") pages.add(tag);
    }
  }
  return [...pages].sort();
}

/** The layout a page that covers others holds (it declares `covers`, `links` or `interrupts`). */
function coverLayoutOf(value: unknown): ReturnType<typeof defineLayout> | undefined {
  return typeof value === "object" && value !== null ? (value as { __waygraphCoverLayout?: ReturnType<typeof defineLayout> }).__waygraphCoverLayout : undefined;
}

/** Imports every layout of the project and sets what each covers; returns them. */
export async function loadLayouts(projectDir: string, known?: SiteTree): Promise<LoadedLayout[]> {
  const loaded: LoadedLayout[] = [];
  // Any file that says `covers:` is a shell, wherever it's named.
  const files = walkDir(projectDir, /\.block\.ts$/).filter((f) => SHELL_FILE.test(f) || /\bcovers\s*:/.test(readFileSync(f, "utf8")));
  // A project with layouts gets its site map once (or is given it): breadcrumbs follow it (`to: "parent"`,
  // `Trait.breadcrumbs`).
  const tree = files.length ? (known ?? (await siteMapOf(projectDir))) : undefined;
  if (tree) {
    setTrails(Object.fromEntries(Object.entries(tree.paths).map(([page, path]) => [path, ancestorPages(tree, page).map((up) => tree.paths[up] ?? "")])));
  }
  for (const file of files) {
    let mod: Record<string, unknown>;
    try {
      mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    } catch (err) {
      reportImportError(relative(projectDir, file), err);
      continue;
    }
    for (const layout of Object.values(mod).flatMap((v) => (isLayout(v) ? [v] : coverLayoutOf(v) ? [coverLayoutOf(v) as ReturnType<typeof defineLayout>] : []))) {
      const covers = layout.on ? [...layout.on] : await pagesUnder(dirname(file), projectDir);
      const state = layoutState(layout.name);
      state.covers = covers;
      state.loaded = true;
      // A link up to the page above: the site map says which, page by page.
      const upLinks = Object.values(layout.go).filter((nav) => (nav as { __waygraphLayout?: { parent?: boolean } }).__waygraphLayout?.parent);
      if (upLinks.length && tree) {
        state.parents = Object.fromEntries(covers.flatMap((page) => {
          const up = parentPage(tree, page);
          return up ? [[page, up]] : [];
        }));
      }
      loaded.push({ name: layout.name, file: relative(projectDir, file).split("\\").join("/"), covers });
    }
  }
  return loaded;
}

/** The project's site map, from the addresses its Blocks know pages by. */
async function siteMapOf(projectDir: string): Promise<SiteTree> {
  const scan = await scanProject(projectDir, { flows: false, maps: false });
  const urls = pageUrls(scan.blocks);
  return siteTree(Object.keys(urls), urls, envString("WAYGRAPH_BASE_URL"));
}

/** A scan's layout links take the routes loading worked out (the pages each runs from, where each link up leads). */
export function refreshLayoutRoutes(scan: { blocks: { block: object; from: string[]; to: string[] }[] }): void {
  for (const b of scan.blocks) {
    const marked = b.block as { __waygraphLayout?: unknown; __waygraphFrom?: string[]; __waygraphTo?: string[] };
    if (!marked.__waygraphLayout) continue;
    b.from = [...(marked.__waygraphFrom ?? ["*"])];
    b.to = [...(marked.__waygraphTo ?? [])];
  }
}
