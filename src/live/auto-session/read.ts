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

/** For a list at `path`: only the rows where each field equals the given text, then rows `from` up to `to` (exclusive). */
export interface ListPick {
  rows?: { from: number; to?: number } | undefined;
  where?: Record<string, string> | undefined;
}

/** Applies a {@link ListPick} to the list `pick()` put at `path` (anything else is left as it is). */
function pickRows(tree: Record<string, unknown>, path: string, list: ListPick, notes: Record<string, string>): void {
  const parts = path.split(".");
  let parent: Record<string, unknown> = tree;
  for (const part of parts.slice(0, -1)) parent = parent[part] as Record<string, unknown>;
  const last = parts[parts.length - 1]!;
  const rows = parent[last];
  if (!Array.isArray(rows)) return;
  const where = Object.entries(list.where ?? {});
  const matched = where.length ? rows.filter((row) => where.every(([field, value]) => String((row as Record<string, unknown>)?.[field] ?? "") === value)) : rows;
  const from = list.rows?.from ?? 0;
  const to = list.rows?.to ?? matched.length;
  parent[last] = matched.slice(from, to);
  notes[path] = `rows ${from}-${Math.min(to, matched.length)} of ${matched.length}${where.length ? ` matching (of ${rows.length})` : ""}`;
}

/** Reads the page the session is on (`here`); with `path`, only that part (`post.comments`), and of a list, `list`'s rows. */
export async function readSession(page: Page, mem: MemPage, here: string | null, path?: string, list?: ListPick): Promise<SessionRead> {
  const base = { page: here, url: page.url() };
  if (readBlocksFor(here).length === 0) {
    return { ...base, read: {}, missing: [], notes: {}, readBlocks: [], skipped: [], hint: "no Read Block for this page: use `dom` to look at it" };
  }
  const { read, blocks, skipped } = await readCheckpoint(page, mem, here);
  const inPath = (p: string) => !path || p === path || p.startsWith(path + ".");
  const tree = path ? pick(read.toJSON(), path) : read.toJSON();
  const notes = Object.fromEntries(Object.entries(read.notes).filter(([p]) => inPath(p)));
  if (path && (list?.rows || list?.where)) pickRows(tree, path, list, notes);
  return {
    ...base,
    read: tree,
    missing: read.missing.filter(inPath),
    notes,
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
