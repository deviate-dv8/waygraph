// Finds a Block or Flow in the project (and its installed map packages) by export name or Block name.
import { relative } from "node:path";
import { pathToFileURL } from "node:url";
import { isBlockLike, walkDir } from "../../manifest/scan.js";
import type { AnyBlock } from "../../manifest/scan.js";
import type { Flow } from "../../engine/flow/flow.js";
import type { Checkpoint } from "../../engine/checkpoint/checkpoint.js";

export interface FoundBlock {
  block: AnyBlock;
  exportName: string;
  file: string;
}

/** A built Flow: what `map().end()` returns. */
function isFlow(val: unknown): val is Flow<Checkpoint<string>> {
  return val !== null && typeof val === "object" && typeof (val as { run?: unknown }).run === "function" && typeof (val as { blocks?: unknown }).blocks === "function";
}
import { installedMapPackages, mapPackageBlockFiles } from "../../manifest/maps.js";
import { reportImportError } from "../../manifest/project.js";


/** Each file's module, in order; a file that fails to import is reported and skipped. */
async function* importEach(projectDir: string, files: readonly string[]): AsyncGenerator<{ file: string; mod: Record<string, unknown> }> {
  for (const file of files) {
    try {
      yield { file, mod: await import(pathToFileURL(file).href) };
    } catch (err) {
      reportImportError(relative(projectDir, file), err);
    }
  }
}

export async function findBlock(projectDir: string, ref: string): Promise<FoundBlock> {
  const files = [...walkDir(projectDir, /\.block\.ts$/), ...installedMapPackages(projectDir).flatMap(mapPackageBlockFiles)];
  const byRuntimeName: FoundBlock[] = [];
  for await (const { file, mod } of importEach(projectDir, files)) {
    for (const [exportName, exported] of Object.entries(mod)) {
      if (!isBlockLike(exported)) continue;
      if (exportName === ref) return { block: exported, exportName, file };
      if (exported.name === ref) byRuntimeName.push({ block: exported, exportName, file });
    }
  }
  if (byRuntimeName.length === 1) return byRuntimeName[0]!;
  if (byRuntimeName.length > 1) {
    throw new Error(
      "waygraph run --blocks: \"" + ref + "\" matches " + byRuntimeName.length + " Blocks by name - " +
        byRuntimeName.map((b) => b.exportName + " (" + b.file + ")").join(", ") +
        ". Use the export name to disambiguate.",
    );
  }
  throw new Error("waygraph run --blocks: no Block named \"" + ref + "\" found under " + projectDir);
}


/**
 * Finds an already-defined Flow by its export name (e.g. loginFlow) among
 * the project's *.flow.ts files - "I already have this wired up, just point
 * the stepper at it, no chain spec to hand-write." Flows have no runtime
 * .name of their own (unlike Blocks), so this only matches by export
 * identifier. Returns null (not a throw) when nothing matches - the caller
 * falls back to ordinary block-chain spec parsing.
 */
export async function findFlow(projectDir: string, flowName: string): Promise<Flow<Checkpoint<string>> | null> {
  const files = walkDir(projectDir, /\.flow\.ts$/);
  for await (const { mod } of importEach(projectDir, files)) {
    const candidate = mod[flowName];
    if (isFlow(candidate)) return candidate;
  }
  return null;
}
