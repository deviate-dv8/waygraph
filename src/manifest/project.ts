// Scans a project (and any injected Block libraries) into its Blocks and Flows, with each Block's route.
import { relative } from "node:path";
import type { BlocksSelect } from "./select.js";
import { matchBlocksSelect } from "./select.js";
import { exploreRoots, injectTaggedFile } from "./roots.js";
import { blockKind, importFresh, isBlockLike, isFlowLike, walkDir } from "./scan.js";
import type { AnyBlock } from "./scan.js";
import { legacyRoutes } from "./legacy-generics.js";
import { installedMapPackages, mapPackageBlockFiles } from "./maps.js";

export type BlockKind = "nav" | "page" | "assert" | "method" | "effect" | "api" | "block";

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
  /** Route read from `<In, Out>` source text: the Block still uses the deprecated form. */
  legacy: boolean;
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

export interface ProjectScan {
  projectDir: string;
  blocks: ScannedBlock[];
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

function kindOf(block: object): BlockKind {
  const kind = blockKind(block);
  if (kind === "nav" || kind === "page" || kind === "assert" || kind === "api") return kind;
  const salt = (block as { __waygraphSalt?: string }).__waygraphSalt;
  if (salt === "effect" || salt === "method" || salt === "api") return salt;
  return "block";
}

function defaultImportError(relFile: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (/second time|playwright/i.test(msg)) console.error(`waygraph: skip ${relFile}: ${msg.split("\n")[0]}`);
}

/** Imports every `*.block.ts` (and `*.flow.ts`) under the project and its injected roots. */
export async function scanProject(projectDir: string, opts: ScanOptions = {}): Promise<ProjectScan> {
  const select = opts.blocksSelect;
  const onError = opts.onImportError ?? defaultImportError;
  const blocks: ScannedBlock[] = [];
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
    let legacyCalls: Awaited<ReturnType<typeof legacyRoutes>> | undefined;
    let legacyIndex = 0;
    for (const [exportName, exported] of Object.entries(mod)) {
      if (!isBlockLike(exported)) continue;
      if (select && !matchBlocksSelect(select, { relFile: file, blockName: exported.name })) continue;
      const marked = exported as { __waygraphFrom?: string[]; __waygraphTo?: string[] };
      let from = marked.__waygraphFrom ?? [];
      let to = marked.__waygraphTo ?? [];
      let legacy = false;
      if (to.length === 0) {
        legacyCalls ??= await legacyRoutes(absFile);
        const call = legacyCalls[legacyIndex++];
        if (call) {
          from = call.from;
          to = call.to;
          legacy = true;
        }
        if (from.length === 0 || to.length === 0) {
          skipped.push({
            block: exported.name,
            file,
            reason: call ? `couldn't resolve "${from.length === 0 ? call.in : call.out}" to a Checkpoint tag` : "no route: declare from/to with Checkpoint values",
          });
          from = [];
          to = [];
        }
      }
      blocks.push({
        block: exported,
        name: exported.name,
        exportName,
        kind: kindOf(exported),
        description: typeof exported.description === "string" ? exported.description : "",
        from: [...from],
        to: [...to],
        requires: (exported.requires ?? []).map((k) => (k as { name: string }).name),
        file,
        absFile,
        legacy,
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
  return { projectDir, blocks, flows, skipped };
}
