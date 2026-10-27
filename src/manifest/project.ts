// Scans a project (and any injected Block libraries) into its Blocks and Flows, with each Block's route.
import { relative } from "node:path";
import type { BlocksSelect } from "./select.js";
import { matchBlocksSelect } from "./select.js";
import { exploreRoots, injectTaggedFile } from "./roots.js";
import { importFresh, isBlockLike, isFlowLike, isReadBlockLike, walkDir } from "./scan.js";
import type { ReadBlock } from "../engine/read/read-block.js";
import type { AnyBlock } from "./scan.js";
import { installedMapPackages, mapPackageBlockFiles } from "./maps.js";
import { blockKindOf, type BlockKind } from "../engine/block/kind.js";


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

/** A Read Block found in a scanned file (beta). */
export interface ScannedReadBlock {
  block: ReadBlock;
  exportName: string;
  file: string;
  map?: string;
}

export interface ProjectScan {
  projectDir: string;
  blocks: ScannedBlock[];
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
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`waygraph: skip ${relFile}: ${msg.split("\n")[0]}`);
}

/** Imports every `*.block.ts` (and `*.flow.ts`) under the project and its injected roots. */
export async function scanProject(projectDir: string, opts: ScanOptions = {}): Promise<ProjectScan> {
  const select = opts.blocksSelect;
  const onError = opts.onImportError ?? reportImportError;
  const blocks: ScannedBlock[] = [];
  const readBlocks: ScannedReadBlock[] = [];
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
    for (const [exportName, exported] of Object.entries(mod)) {
      if (isReadBlockLike(exported)) {
        readBlocks.push({ block: exported, exportName, file, ...(map ? { map } : {}) });
        continue;
      }
      if (!isBlockLike(exported)) continue;
      if (select && !matchBlocksSelect(select, { relFile: file, blockName: exported.name })) continue;
      const marked = exported as { __waygraphFrom?: string[]; __waygraphTo?: string[] };
      const from = marked.__waygraphFrom ?? [];
      const to = marked.__waygraphTo ?? [];
      // Every factory records a route; only a bare defineBlock has none.
      if (to.length === 0) skipped.push({ block: exported.name, file, reason: "no route: build it with a define*Block factory and Checkpoint values" });
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
    }
  };

  for (const root of exploreRoots(projectDir, opts.inject)) {
    let files = walkDir(root, /\.block\.ts$/);
    if (select && select.kind !== "regex") {
      files = files.filter((f) => matchBlocksSelect(select, { relFile: relative(root, f).replace(/\\/g, "/") }));
    }
    for (const absFile of files) {
      const rel = relative(root, absFile).replace(/\\/g, "/");
      await scanBlockFile(absFile, rel, injectTaggedFile(projectDir, root, rel));
    }
    if (opts.flows === false) continue;
    for (const absFile of walkDir(root, /\.flow\.ts$/)) {
      const rel = relative(root, absFile).replace(/\\/g, "/");
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
        const rel = relative(pkg.dir, absFile).replace(/\\/g, "/");
        if (select && select.kind !== "regex" && !matchBlocksSelect(select, { relFile: `${pkg.name}/${rel}` })) continue;
        await scanBlockFile(absFile, rel, `${pkg.name}/${rel}`, pkg.name);
      }
    }
  }
  return { projectDir, blocks, readBlocks, flows, skipped };
}
