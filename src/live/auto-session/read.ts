// What a session's page shows, from the project's Read Blocks: the `read` op, and the read every snapshot carries.
import type { Page } from "@playwright/test";
import type { MemPage } from "../../engine/mem/mem.js";
import { readBlocksFor, readCheckpoint } from "../../engine/read/read-block.js";

/** The answer to `waygraph pilot read <id> [path]`. */
export interface SessionRead {
  page: string | null;
  url: string;
  read: Record<string, unknown>;
  missing: string[];
  notes: Record<string, string>;
  readBlocks: string[];
  skipped: { block: string; reason: string }[];
  /** Set when no Read Block covers this page. */
  hint?: string;
}

/** A snapshot shows at most this many items of a list; `read <path>` returns the rest. */
const SNAPSHOT_LIST_CAP = 20;

function pick(tree: Record<string, unknown>, path: string): Record<string, unknown> {
  const parts = path.split(".");
  let node: unknown = tree;
  for (const part of parts) node = node !== null && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined;
  const out: Record<string, unknown> = {};
  let at = out;
  for (const part of parts.slice(0, -1)) at = at[part] = {};
  at[parts[parts.length - 1]!] = node ?? null;
  return out;
}

/** Reads the page the session is on (`here`); with `path`, only that part (`post.comments`). */
export async function readSession(page: Page, mem: MemPage, here: string | null, path?: string): Promise<SessionRead> {
  const base = { page: here, url: page.url() };
  if (readBlocksFor(here).length === 0) {
    return { ...base, read: {}, missing: [], notes: {}, readBlocks: [], skipped: [], hint: "no Read Block for this page: use `dom` to look at it" };
  }
  const { read, blocks, skipped } = await readCheckpoint(page, mem, here);
  const inPath = (p: string) => !path || p === path || p.startsWith(path + ".");
  return {
    ...base,
    read: path ? pick(read.toJSON(), path) : read.toJSON(),
    missing: read.missing.filter(inPath),
    notes: Object.fromEntries(Object.entries(read.notes).filter(([p]) => inPath(p))),
    readBlocks: blocks,
    skipped,
  };
}

/** The read a status / send / reach snapshot carries: lists cut to a few items, nothing at all without Read Blocks. */
export async function snapshotRead(page: Page, mem: MemPage, here: string | null): Promise<{ read?: Record<string, unknown>; missing?: string[]; readNotes?: Record<string, string> }> {
  if (readBlocksFor(here).length === 0) return {};
  const got = await readSession(page, mem, here);
  const notes = { ...got.notes };
  const cap = (node: unknown, path: string): unknown => {
    if (Array.isArray(node)) {
      if (node.length > SNAPSHOT_LIST_CAP) notes[path] = `${SNAPSHOT_LIST_CAP} of ${node.length} shown: \`read <id> ${path}\` for all`;
      return node.slice(0, SNAPSHOT_LIST_CAP);
    }
    if (node === null || typeof node !== "object") return node;
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, cap(v, path ? `${path}.${k}` : k)]));
  };
  return { read: cap(got.read, "") as Record<string, unknown>, missing: got.missing, ...(Object.keys(notes).length ? { readNotes: notes } : {}) };
}
