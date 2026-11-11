// Scans a project (and any injected Block libraries) into its Blocks and Flows, with each Block's route.
import { messageOf } from "../engine/errors.js";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { BlocksSelect } from "./select.js";
import { matchBlocksSelect } from "./select.js";
import { exploreRoots, injectTaggedFile } from "./roots.js";
import { importFresh, isBlockLike, isFlowLike, isReadBlockLike, toPosix, walkDir } from "./scan.js";
import type { ReadBlock } from "../engine/read/read-block.js";
import type { AnyBlock } from "./scan.js";
import { installedMapPackages, mapPackageBlockFiles } from "./maps.js";
import { blockKindOf, type BlockKind } from "../engine/block/kind.js";
import { isLayout, type Layout, type LayoutLink } from "../engine/block/kinds/layout.js";
import type { PageMethodEntry } from "../engine/block/kinds/page.js";


export interface ScannedBlock {
  block: AnyBlock;
  name: string;
  exportName: string;
  kind: BlockKind;
  description: string;
  /** Checkpoint tags it runs from (`"*"` = anywhere) and lands on. Empty `to` = route unknown (see `skipped`). */
  from: string[];
  to: string[];
  requires: string[];
  /** Project-relative path; Blocks from an injected library are tagged `@label/...`. */
  file: string;
  absFile: string;
  /** The installed map package it came from (its `file` is then `<package>/<path>`). */
  map?: string;
}

export interface ScannedFlow {
  flow: { run: (...args: unknown[]) => Promise<unknown>; blocks: () => unknown[] };
  exportName: string;
  file: string;
  absFile: string;
}

/** A Block as the live menus (auto, pilot) hold it: navigation or action. */
export interface BlockEntry {
  block: AnyBlock;
  exportName: string;
  file: string;
  kind: "nav" | "action";
  description: string;
}

/** A Read Block found in a scanned file. */
export interface ScannedReadBlock {
  block: ReadBlock;
  exportName: string;
  file: string;
  absFile: string;
  map?: string;
}

/** A layout found in a scanned file. */
export interface ScannedLayout {
  layout: Layout<Record<string, LayoutLink>, Record<string, PageMethodEntry>>;
  exportName: string;
  file: string;
}

export interface ProjectScan {
  projectDir: string;
  blocks: ScannedBlock[];
  layouts: ScannedLayout[];
  readBlocks: ScannedReadBlock[];
  flows: ScannedFlow[];
  skipped: { block: string; file: string; reason: string }[];
}

export interface ScanOptions {
  blocksSelect?: BlocksSelect | undefined;
  inject?: string[] | undefined;
  /** Also import `*.flow.ts` files. Default true. */
  flows?: boolean;
  /** Also scan installed map packages (dependencies with a `waygraph.map.json`). Default true. */
  maps?: boolean;
  /** Called when a file fails to import (default: a one-line warning for Playwright double-install errors). */
  onImportError?: (relFile: string, err: unknown) => void;
}

/** A file that fails to import is left out of the scan, and said so: a silent skip reads as "nothing there". */
export function reportImportError(relFile: string, err: unknown): void {
  const msg = messageOf(err);
  console.error(`waygraph: skip ${relFile}: ${msg.split("\n")[0]}`);
}

/**
 * Imports every `*.mem-stubs.ts` in the project: a stub registers when its file is imported, so a run, a demo, a test
 * or a session that needs one never depends on a flow importing the file.
 */
export async function loadMemStubs(projectDir: string): Promise<void> {
  for (const file of walkDir(projectDir, /\.mem-stubs?\.ts$/)) await importFresh(file).catch((err: unknown) => reportImportError(relative(projectDir, file), err));
}

/**
 * Imports the project's accounts (`src/accounts/`): an account registers when its file is imported, so a sign-in flow
 * played on its own knows whose it is (and signs in as that person) without a flow importing the file.
 */
export async function loadAccounts(projectDir: string): Promise<void> {
  const folder = join(projectDir, "src", "accounts");
  if (!existsSync(folder)) return;
  for (const file of walkDir(folder, /\.ts$/)) await importFresh(file).catch((err: unknown) => reportImportError(relative(projectDir, file), err));
}

/** Imports every `*.block.ts` (and `*.flow.ts`) under the project and its injected roots. */
export async function scanProject(projectDir: string, opts: ScanOptions = {}): Promise<ProjectScan> {
  const select = opts.blocksSelect;
  const onError = opts.onImportError ?? reportImportError;
  const blocks: ScannedBlock[] = [];
  const readBlocks: ScannedReadBlock[] = [];
  const layouts: ScannedLayout[] = [];
  const flows: ScannedFlow[] = [];
  const skipped: ProjectScan["skipped"] = [];

  const scanBlockFile = async (absFile: string, rel: string, file: string, map?: string): Promise<void> => {
    let mod: Record<string, unknown>;
    try {
      mod = await importFresh(absFile);
    } catch (err) {
      onError(rel, err);
      return;
    }
    const addBlock = (exportName: string, exported: AnyBlock): void => {
      if (select && !matchBlocksSelect(select, { relFile: file, blockName: exported.name })) return;
      const marked = exported as { __waygraphFrom?: string[]; __waygraphTo?: string[] };
      const from = marked.__waygraphFrom ?? [];
      const to = marked.__waygraphTo ?? [];
      // Every factory records a route; only a bare defineBlock has none (a layout's link up gets its route when layouts load).
      if (to.length === 0 && !(exported as { __waygraphLayout?: unknown }).__waygraphLayout) skipped.push({ block: exported.name, file, reason: "no route: build it with a define*Block factory and Checkpoint values" });
      blocks.push({
        block: exported,
        name: exported.name,
        exportName,
        kind: blockKindOf(exported),
        description: typeof exported.description === "string" ? exported.description : "",
        from: [...from],
        to: [...to],
        requires: (exported.requires ?? []).map((k) => (k as { name: string }).name),
        file,
        absFile,
        ...(map ? { map } : {}),
      });
    };
    for (const [exportName, exported] of Object.entries(mod)) {
      // A layout's links and what it shows are Blocks of its file, by their place in it (Sidebar.go.plan); its actions are
      // Methods of their own files.
      if (isLayout(exported)) {
        layouts.push({ layout: exported, exportName, file });
        if (exported.readBlock) readBlocks.push({ block: exported.readBlock, exportName: `${exportName}.read`, file, absFile, ...(map ? { map } : {}) });
        for (const [key, nav] of Object.entries(exported.go)) addBlock(`${exportName}.go.${key}`, nav);
        continue;
      }
      if (isReadBlockLike(exported)) {
        readBlocks.push({ block: exported, exportName, file, absFile, ...(map ? { map } : {}) });
        continue;
      }
      if (isBlockLike(exported)) {
        addBlock(exportName, exported);
        // A page's own read is a Read Block of its file, by its place in it (CartPage.read).
        const own = (exported as { __waygraphReadBlock?: ReadBlock }).__waygraphReadBlock;
        if (own) readBlocks.push({ block: own, exportName: `${exportName}.read`, file, absFile, ...(map ? { map } : {}) });
      }
    }
  };

  for (const root of exploreRoots(projectDir, opts.inject)) {
    let files = walkDir(root, /\.block\.ts$/);
    if (select && select.kind !== "regex") {
      files = files.filter((f) => matchBlocksSelect(select, { relFile: toPosix(relative(root, f)) }));
    }
    for (const absFile of files) {
      const rel = toPosix(relative(root, absFile));
      await scanBlockFile(absFile, rel, injectTaggedFile(projectDir, root, rel));
    }
    if (opts.flows === false) continue;
    for (const absFile of walkDir(root, /\.flow\.ts$/)) {
      const rel = toPosix(relative(root, absFile));
      let mod: Record<string, unknown>;
      try {
        mod = await importFresh(absFile);
      } catch (err) {
        onError(rel, err);
        continue;
      }
      for (const [exportName, exported] of Object.entries(mod)) {
        if (isFlowLike(exported)) flows.push({ flow: exported, exportName, file: injectTaggedFile(projectDir, root, rel), absFile });
      }
    }
  }
  if (opts.maps !== false) {
    for (const pkg of installedMapPackages(projectDir)) {
      for (const absFile of mapPackageBlockFiles(pkg)) {
        const rel = toPosix(relative(pkg.dir, absFile));
        if (select && select.kind !== "regex" && !matchBlocksSelect(select, { relFile: `${pkg.name}/${rel}` })) continue;
        await scanBlockFile(absFile, rel, `${pkg.name}/${rel}`, pkg.name);
      }
    }
  }
  return { projectDir, blocks, layouts, readBlocks, flows, skipped };
}
