// The one place a project's files are walked and imported. Everything that needs the project's Blocks or Flows
// (graph, check, map, auto, traverse, the runner) goes through here.
import { readdirSync, statSync, type Dirent } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Block } from "../engine/block/block.js";
import type { Checkpoint } from "../engine/checkpoint/checkpoint.js";

/** Every file under `dir` whose name matches, skipping `node_modules`, `dist` and `.git`. */
export function walkDir(dir: string, pattern: RegExp): string[] {
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
 * Imports a project file. The file's mtime is part of the URL: Node caches an ESM import per specifier for the life of the
 * process, so a long-running session reloading an edited Block would otherwise keep the first version.
 */
export async function importFresh(filePath: string): Promise<Record<string, unknown>> {
  const resolved = resolve(filePath);
  const url = pathToFileURL(resolved);
  url.searchParams.set("t", String(statSync(resolved).mtimeMs));
  return (await import(url.href)) as Record<string, unknown>;
}

export type AnyBlock = Block<Checkpoint<string>, Checkpoint<string>> & { description?: string };

export function isBlockLike(val: unknown): val is AnyBlock {
  if (val === null || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  if (typeof obj.name !== "string") return false;
  const instruction = obj.instruction as Record<string, unknown> | undefined;
  return instruction !== null && typeof instruction === "object" && typeof instruction?.act === "function";
}

export function isFlowLike(val: unknown): val is { run: (...args: unknown[]) => Promise<unknown>; blocks: () => unknown[] } {
  return (
    val !== null &&
    typeof val === "object" &&
    typeof (val as { run?: unknown }).run === "function" &&
    typeof (val as { blocks?: unknown }).blocks === "function"
  );
}

/** The factory kind a Block was built with (`nav`, `page`, `assert`), or undefined for Methods and Effects. */
export function blockKind(block: object): string | undefined {
  return (block as { __waygraphKind?: string }).__waygraphKind;
}
