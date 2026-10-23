// Moved verbatim from the former CHAIN_RUNNER_SCRIPT template string in cli.ts (see src/ARCHITECTURE.md).
// Runs inside the target project's own waygraph copy - keep it dependency-light and self-contained.
import { pathToFileURL } from "node:url";
import { isBlockLike, walkDir } from "../manifest/scan.js";


export async function findBlock(projectDir, ref) {
  const files = walkDir(projectDir, /\.block\.ts$/);
  const byRuntimeName = [];
  for (const file of files) {
    let mod;
    try {
      mod = await import(pathToFileURL(file).href);
    } catch {
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
export async function findFlow(projectDir, flowName) {
  const files = walkDir(projectDir, /\.flow\.ts$/);
  for (const file of files) {
    let mod;
    try {
      mod = await import(pathToFileURL(file).href);
    } catch {
      continue;
    }
    const candidate = mod[flowName];
    if (candidate && typeof candidate.run === "function") {
      return candidate;
    }
  }
  return null;
}


export function parseChainSpec(spec) {
  return spec
    .split(/\bthen\b/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const m = /^([A-Za-z_$][\w-]*)\s*(?:\(([\s\S]*)\))?$/.exec(s);
      if (!m) {
        throw new Error(
          "waygraph chain: could not parse segment \"" + s + "\" - expected \"blockName\" or \"blockName({...json...})\"",
        );
      }
      const ref = m[1];
      const json = m[2] ? m[2].trim() : undefined;
      return json ? { ref, json } : { ref };
    });
}
