// A Read Block: what a page shows, read after a step lands there. Its instruction has one phase, `read`; it never acts,
// navigates or appears in a flow. The engine finds the Read Blocks for a Checkpoint by their `from`.
import type { Page } from "@playwright/test";
import type { Checkpoint } from "../checkpoint/checkpoint.js";
import { WaygraphError, MSG_READ_DUPLICATE } from "../errors.js";
import type { MemKey, MemPage } from "../mem/mem.js";
import type { ReadKey, ReadSpec } from "./read-key.js";
import { ReadPage } from "./read-page.js";
import { createReadCtx, eachReader, Reader, type ReadCtx } from "./readers.js";
import { runReadSpecs, settlePage } from "./run-read.js";

/** Options for {@link defineReadBlock}: shaped like a Method's, with one instruction phase. */
export interface ReadBlockOptions {
  name: string;
  description?: string;
  /** The Checkpoint(s) whose page this reads. Leave it out to read on every page (a header, the signed-in user). */
  from?: Checkpoint<string> | readonly Checkpoint<string>[];
  /** Mem keys `read` uses through `ctx.mem`; without them set, this Read Block is skipped (and said so). */
  requires?: readonly MemKey<unknown>[];
  instruction: {
    /** Returns one namespace's spec (`Post({ ... })`) or several. Runs on every read, so it can use `ctx.mem`. */
    read(ctx: ReadCtx): ReadSpec | readonly ReadSpec[];
  };
}

/** A defined Read Block. */
export interface ReadBlock {
  readonly name: string;
  readonly description: string;
  /** Checkpoint names, or `["*"]` for every page. */
  readonly from: readonly string[];
  readonly requires: readonly MemKey<unknown>[];
  readonly instruction: ReadBlockOptions["instruction"];
}

/** Every Read Block a loaded file defined, by name (the scanner re-imports files; a re-import replaces, never duplicates). */
const registry = new Map<string, ReadBlock>();

/**
 * Declares what a page shows, as typed data an agent or a test can read.
 * @example
 * export const PostReadBlock = defineReadBlock({
 *   name: "read-post",
 *   from: PostOpen,
 *   instruction: {
 *     read: (ctx) => Post({ title: ctx.page.text("h1"), likes: ctx.page.number(".likes") }),
 *   },
 * });
 */
export function defineReadBlock(options: ReadBlockOptions): ReadBlock {
  const from = options.from === undefined ? ["*"] : (Array.isArray(options.from) ? options.from : [options.from]).map((c: Checkpoint<string>) => c.__state);
  const block: ReadBlock = {
    name: options.name,
    description: options.description ?? "",
    from,
    requires: options.requires ?? [],
    instruction: options.instruction,
  };
  registry.set(block.name, block);
  return block;
}

/** The Read Blocks that read `checkpoint`'s page (its own, then the every-page ones). `null`: only the every-page ones. */
export function readBlocksFor(checkpoint: string | null): ReadBlock[] {
  const blocks = [...registry.values()];
  return [...blocks.filter((b) => checkpoint !== null && b.from.includes(checkpoint)), ...blocks.filter((b) => b.from.includes("*"))];
}

/** What a read of one Checkpoint's page found, and which Read Blocks took part. */
export interface CheckpointRead {
  read: ReadPage;
  blocks: string[];
  /** Read Blocks left out, and why (a Mem key they need is not set). */
  skipped: { block: string; reason: string }[];
}

/** Reads `checkpoint`'s page with every Read Block for it, merged into one {@link ReadPage}. */
export async function readCheckpoint(page: Page, mem: MemPage, checkpoint: string | null): Promise<CheckpointRead> {
  const specs: ReadSpec[] = [];
  const owner = new Map<string, string>();
  const blocks: string[] = [];
  const skipped: CheckpointRead["skipped"] = [];
  for (const block of readBlocksFor(checkpoint)) {
    const unset = block.requires.filter((k) => !mem.has(k)).map((k) => k.name);
    if (unset.length) {
      skipped.push({ block: block.name, reason: `needs mem ${unset.join(", ")}` });
      continue;
    }
    const got = block.instruction.read(createReadCtx(mem));
    for (const spec of Array.isArray(got) ? got : [got as ReadSpec]) {
      for (const field of Object.keys(spec.fields)) {
        const path = `${spec.namespace}.${field}`;
        const other = owner.get(path);
        if (other) throw new WaygraphError("WG_READ_DUPLICATE", MSG_READ_DUPLICATE(path, other, block.name));
        owner.set(path, block.name);
      }
      specs.push(spec);
    }
    blocks.push(block.name);
  }
  if (specs.length) await settlePage(page);
  const { values, notes } = await runReadSpecs(page, mem, specs);
  return { read: new ReadPage(values, notes), blocks, skipped };
}

/**
 * Reads one key now, wherever the page is: runs only the Read Blocks whose read fills that key's namespace (any
 * Checkpoint - a check doesn't know which it is on). Undefined when no Read Block reads it, or the page doesn't show it.
 */
export async function readKeyNow<T>(page: Page, mem: MemPage, key: ReadKey<T>): Promise<T | undefined> {
  const namespace = key.path.split(".")[0];
  const specs: ReadSpec[] = [];
  for (const block of registry.values()) {
    if (block.requires.some((k) => !mem.has(k))) continue;
    const got = block.instruction.read(createReadCtx(mem));
    for (const spec of Array.isArray(got) ? got : [got as ReadSpec]) if (spec.namespace === namespace) specs.push(spec);
  }
  if (specs.length === 0) return undefined;
  const { values, notes } = await runReadSpecs(page, mem, specs);
  const read = new ReadPage(values, notes);
  return read.has(key) ? read.get(key) : undefined;
}

/** What a field reads, as a type a viewer can show: `"string"`, `"number"`, `"boolean"`, `"string[]"`, a row shape. */
export type ReadShape = string | readonly [Record<string, string>];

const SHAPE: Record<string, string> = { text: "string", attr: "string", value: "string", number: "number", count: "number", visible: "boolean", texts: "string[]", fn: "unknown" };

/**
 * The fields a Read Block reads and their shapes, by path (`"catalog.items": [{ name: "string", price: "number" }]`),
 * without a page: `read` only builds plans. Throws when `read` needs a Mem value that `mem` does not have.
 */
export function readBlockShape(block: ReadBlock, mem: MemPage): Record<string, ReadShape> {
  const out: Record<string, ReadShape> = {};
  const shapeOf = (path: string, { plan }: Reader<unknown>): void => {
    if (plan.kind === "list") out[path] = [Object.fromEntries(Object.entries(plan.fields).map(([k, f]) => [k, SHAPE[f.kind] ?? "unknown"]))];
    else if (plan.kind === "table") out[path] = [Object.fromEntries(Object.keys(plan.columns).map((k) => [k, "string"]))];
    else out[path] = SHAPE[plan.kind] ?? "unknown";
  };
  const got = block.instruction.read(createReadCtx(mem));
  for (const spec of Array.isArray(got) ? got : [got as ReadSpec]) eachReader(spec.fields, spec.namespace, shapeOf);
  return out;
}
