// A ReadPage: what a page showed, read once, kept like a MemPage - typed `get` by key, and loud when a value is missing.
import { WaygraphError, MSG_READ_MISSING } from "../errors.js";
import type { ReadKey } from "./read-key.js";

export class ReadPage {
  private readonly tree: Record<string, unknown> = {};
  /** Paths the page did not show (`null` in {@link toJSON}). */
  readonly missing: readonly string[];
  /** Why a path is missing or partial, e.g. a table column that isn't there, or rows not rendered yet. */
  readonly notes: Readonly<Record<string, string>>;

  constructor(values: ReadonlyMap<string, unknown>, notes: ReadonlyMap<string, string> = new Map()) {
    const missing: string[] = [];
    for (const [path, value] of values) {
      if (value === null || value === undefined) missing.push(path);
      const parts = path.split(".");
      const leaf = parts.pop() ?? path;
      let node = this.tree;
      for (const part of parts) node = (node[part] ??= {}) as Record<string, unknown>;
      node[leaf] = value ?? null;
    }
    this.missing = missing;
    this.notes = Object.fromEntries(notes);
  }

  private at(path: string): unknown {
    let node: unknown = this.tree;
    for (const part of path.split(".")) {
      if (node === null || typeof node !== "object") return undefined;
      node = (node as Record<string, unknown>)[part];
    }
    return node;
  }

  /** True when the page showed `key` (a read that found nothing is not shown). */
  has<T>(key: ReadKey<T>): boolean {
    const v = this.at(key.path);
    return v !== undefined && v !== null;
  }

  /**
   * The value the page showed for `key`, typed by the key. Throws (naming the key) when this read did not include it
   * or the page did not show it - like `mem.get` on a key never set.
   */
  get<T>(key: ReadKey<T>): T {
    if (!this.has(key)) throw new WaygraphError("WG_READ_MISSING", MSG_READ_MISSING(key.path, this.notes[key.path]));
    return this.at(key.path) as T;
  }

  /** The read as one object, nested by key path (`{ post: { title, comments: [...] } }`); missing paths are `null`. */
  toJSON(): Record<string, unknown> {
    return this.tree;
  }
}
