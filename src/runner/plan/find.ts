import { relative } from "node:path";
// Finds a Block or Flow in the project (and its installed map packages) by export name or Block name.
import { pathToFileURL } from "node:url";
import { isBlockLike, walkDir } from "../../manifest/scan.js";
import { installedMapPackages, mapPackageBlockFiles } from "../../manifest/maps.js";
import { reportImportError } from "../../manifest/project.js";


export async function findBlock(projectDir: string, ref: any) {
  const files = [...walkDir(projectDir, /\.block\.ts$/), ...installedMapPackages(projectDir).flatMap(mapPackageBlockFiles)];
  const byRuntimeName = [];
  for (const file of files) {
    let mod;
    try {
      mod = await import(pathToFileURL(file).href);
    } catch (err) {
      reportImportError(relative(projectDir, file), err);
      continue;
    }
    for (const [exportName, exported] of Object.entries(mod)) {
      if (!isBlockLike(exported)) continue;
      if (exportName === ref) return { block: exported, exportName, file };
      if (exported.name === ref) byRuntimeName.push({ block: exported, exportName, file });
    }
  }
  if (byRuntimeName.length === 1) return byRuntimeName[0];
  if (byRuntimeName.length > 1) {
    throw new Error(
      "waygraph chain: \"" + ref + "\" matches " + byRuntimeName.length + " Blocks by name - " +
        byRuntimeName.map((b) => b.exportName + " (" + b.file + ")").join(", ") +
        ". Use the export name to disambiguate.",
    );
  }
  throw new Error("waygraph chain: no Block named \"" + ref + "\" found under " + projectDir);
}


/**
 * Finds an already-defined Flow by its export name (e.g. loginFlow) among
 * the project's *.flow.ts files - "I already have this wired up, just point
 * the stepper at it, no chain spec to hand-write." Flows have no runtime
 * .name of their own (unlike Blocks), so this only matches by export
 * identifier. Returns null (not a throw) when nothing matches - the caller
 * falls back to ordinary block-chain spec parsing.
 */
export async function findFlow(projectDir: string, flowName: any) {
  const files = walkDir(projectDir, /\.flow\.ts$/);
  for (const file of files) {
    let mod;
    try {
      mod = await import(pathToFileURL(file).href);
    } catch (err) {
      reportImportError(relative(projectDir, file), err);
      continue;
    }
    const candidate = mod[flowName];
    if (candidate && typeof candidate.run === "function") {
      return candidate;
    }
  }
  return null;
}
