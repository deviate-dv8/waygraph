// Where a live session's mem values came from, and setting keys for one step (`send` / `reach --data`).
import type { MemKey, MemPage } from "../../engine/mem/mem.js";
import type { BlockEntry } from "../../manifest/project.js";

/** Where a key's value came from: `--data` when the session started, a mem stub, or `--data` on a step. */
export type MemSource = "data" | "stub" | "step";

/** Every key some Block in the library requires, by name. */
function requiredKeys(library: Map<string, BlockEntry>): Map<string, MemKey<unknown>> {
  const keys = new Map<string, MemKey<unknown>>();
  for (const entry of library.values()) for (const k of entry.block.requires ?? []) keys.set(k.name, k);
  return keys;
}

/**
 * Sets the keys `data` names (by key name, as `--data` does) for the steps that follow, and records them as `step`.
 * A name no Block requires is refused (nothing would read it), naming the keys that exist.
 */
export function setStepData(
  library: Map<string, BlockEntry>,
  mem: MemPage,
  data: Record<string, unknown>,
  sources: Map<string, MemSource>,
): string | undefined {
  const keys = requiredKeys(library);
  const unknown = Object.keys(data).filter((name) => !keys.has(name));
  if (unknown.length) return `--data names ${unknown.join(", ")}, which no Block requires; the keys are: ${[...keys.keys()].sort().join(", ")}`;
  for (const [name, value] of Object.entries(data)) {
    const key = keys.get(name);
    if (!key) continue;
    mem.set(key, value);
    sources.set(name, "step");
  }
  return undefined;
}
