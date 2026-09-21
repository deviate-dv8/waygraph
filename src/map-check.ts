/**
 * `waygraph map` - enforcement for the Waygraph Map folder convention.
 * Real, direct user correction: this is not just a naming preference, it's
 * a forced structure. Requires `src/map/` to exist, and for every Nav/Page
 * Block whose `url` is a plain string, the folder path (relative to
 * `src/map/`, with `(group)` segments excluded - those are intentionally
 * invisible in the real URL, same as Next.js route groups) must verbatim
 * match the URL's own real pathname segments, in order. Catches exactly
 * the class of bug a live session found: `(auth)/signin/` grouping a page
 * whose real URL is `/signin`, not `/auth/signin` - a fabricated grouping
 * that never matched the real site.
 *
 * Self-contained (no import from cli.ts), same reasoning as graph.ts's own
 * header comment: cli.ts runs main() unconditionally at module load.
 */
import { existsSync, readdirSync, statSync, type Dirent } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

export interface MapViolation {
  file: string;
  block: string;
  reason: string;
}

export interface MapNode {
  block: string;
  checkpoint: string | undefined;
  file: string;
  kind: "nav" | "page" | "other";
}

export interface MapCheckResult {
  mapRoot: string;
  hasMapDir: boolean;
  nodes: MapNode[];
  violations: MapViolation[];
}

function walkBlockFiles(dir: string): string[] {
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
      results.push(...walkBlockFiles(full));
    } else if (/\.block\.ts$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function isBlockLike(val: unknown): val is Record<string, unknown> & { name: string } {
  if (val === null || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  if (typeof obj.name !== "string") return false;
  const instruction = obj.instruction as Record<string, unknown> | undefined;
  return instruction !== null && typeof instruction === "object" && typeof instruction?.act === "function";
}

async function importModule(filePath: string): Promise<Record<string, unknown>> {
  const url = pathToFileURL(filePath);
  const mtimeMs = statSync(filePath).mtimeMs;
  url.searchParams.set("t", String(mtimeMs));
  return (await import(url.href)) as Record<string, unknown>;
}

/**
 * `(group)` segments never appear in the real URL (Next.js route-group
 * convention this whole system is explicitly modeled on) - excluded from
 * the comparison, not just cosmetically ignored by discoverGraph.
 *
 * A leading-underscore segment (`_methods/`, same as Next.js's own private-
 * folder convention) is the fixed machinery belonging to ONE endpoint - not
 * a route segment of its own - excluded from the comparison for the same
 * reason `(group)` is: real direct request answering "so i have clear
 * distinction of endpoints vs block folders" - a bare (non-underscore,
 * non-parenthesized) folder name always means a real child Checkpoint/URL
 * segment, no exceptions, so `_methods/foo.block.ts` never gets mistaken
 * for a sibling endpoint the way a bare `methods/` folder structurally
 * could be.
 */
function realSegments(relPath: string): string[] {
  return dirname(relPath)
    .split(sep)
    .filter((s) => s !== "." && s !== "" && !/^\(.*\)$/.test(s) && !s.startsWith("_"));
}

export async function checkMap(projectDir: string): Promise<MapCheckResult> {
  const mapRoot = join(projectDir, "src", "map");
  if (!existsSync(mapRoot)) {
    return { mapRoot, hasMapDir: false, nodes: [], violations: [] };
  }

  const files = walkBlockFiles(mapRoot);
  const nodes: MapNode[] = [];
  const violations: MapViolation[] = [];

  for (const file of files) {
    const relFile = relative(projectDir, file);
    let mod: Record<string, unknown>;
    try {
      mod = await importModule(file);
    } catch (err) {
      violations.push({
        file: relFile,
        block: "(import failed)",
        reason: err instanceof Error ? err.message.split("\n")[0]! : String(err),
      });
      continue;
    }

    for (const exported of Object.values(mod)) {
      if (!isBlockLike(exported)) continue;
      const waygraphKind = (exported as { __waygraphKind?: string }).__waygraphKind;
      const kind: MapNode["kind"] = waygraphKind === "nav" ? "nav" : waygraphKind === "page" ? "page" : "other";
      const navUrl = (exported as { __waygraphNavUrl?: unknown }).__waygraphNavUrl;

      let checkpoint: string | undefined;
      const instruction = (exported as { instruction?: { resolve?: unknown } }).instruction;
      if (instruction?.resolve && typeof instruction.resolve === "function") {
        try {
          const out = (await (instruction.resolve as (i: unknown) => unknown)(undefined)) as
            | { __state?: string }
            | undefined;
          checkpoint = out?.__state;
        } catch {
          /* resolve() needing real input (a Method Block) - not position-defining, skip */
        }
      }

      nodes.push({ block: exported.name, checkpoint, file: relFile, kind });

      if (typeof navUrl !== "string") continue; // only statically-urled Nav/Page Blocks are checkable
      let pathname: string;
      try {
        pathname = new URL(navUrl).pathname;
      } catch {
        continue; // a relative/templated URL - not verbatim-checkable
      }
      const urlSegments = pathname.split("/").filter(Boolean);
      const folderSegments = realSegments(relative(mapRoot, file));
      const matches =
        urlSegments.length === folderSegments.length && urlSegments.every((s, i) => s === folderSegments[i]);
      if (!matches) {
        violations.push({
          file: relFile,
          block: exported.name,
          reason:
            `folder path "${folderSegments.join("/")}" doesn't verbatim-match the real URL path ` +
            `"${urlSegments.join("/")}" (${navUrl}) - (group) segments are excluded from this comparison, ` +
            "everything else must match exactly, same as Next.js file-based routing",
        });
      }
    }
  }

  return { mapRoot, hasMapDir: true, nodes, violations };
}
