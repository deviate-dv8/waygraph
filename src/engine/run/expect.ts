// A step's expectations: what the scenario expects after it, run once its verify has passed. They only read, so they
// run at once (a step costs its slowest check, not the sum) on a read-only page and mem, and a failing step reports
// every expectation it didn't meet, not just the first.
import type { Page } from "@playwright/test";
import type { Checkpoint } from "../checkpoint/checkpoint.js";
import type { SomeBlock } from "../block/some-block.js";
import type { ExpectList } from "../block/kinds/expect.js";
import { mark } from "../block/mark.js";
import { copyWaygraphRuntime } from "../block/block.js";
import type { MemPage } from "../mem/mem.js";
import type { Trait } from "../trait/trait.js";
import { settle, whereIs, type TraitCheckReport } from "../trait/verify.js";
import { envFlag } from "../env.js";
import { WaygraphError, MSG_EXPECT_SET_MEM } from "../errors.js";
import { readOnlyWhile } from "./read-only.js";

/** One expectation as the engine sees it: a Trait, or an Expect Block (any Block: its act waits, its verify judges). */
type AnyExpectation = Trait | SomeBlock;
type AnyExpectList = readonly AnyExpectation[] | Readonly<Record<string, readonly AnyExpectation[] | undefined>>;

/** A Block's expectations (`expect` on the Block, plus any its step added). */
export function expectOf(block: SomeBlock): AnyExpectList | undefined {
  return (block as { __waygraphExpect?: AnyExpectList }).__waygraphExpect;
}

/** Records a Block's expectations on it (a factory's `expect` option). */
export function markExpect<Out extends Checkpoint<string>>(block: object, list: ExpectList<Out> | undefined): void {
  if (list !== undefined) mark(block, "__waygraphExpect", list);
}

/**
 * The same Block with its expectations changed: `false` drops them (a step that only needs the Block's verify), a list
 * adds to them (what only this step's scenario expects).
 */
export function withExpect(block: SomeBlock, change: false | AnyExpectList): SomeBlock {
  const own = expectOf(block);
  const next: SomeBlock = { ...block };
  copyWaygraphRuntime(block, next);
  if (change === false) {
    mark(next, "__waygraphExpect", undefined);
    return next;
  }
  mark(next, "__waygraphExpect", own ? joined(own, change) : change);
  return next;
}

/** Two expectation lists as one; a per-outcome list stays per outcome (a plain list applies to every outcome). */
function joined(a: AnyExpectList, b: AnyExpectList): AnyExpectList {
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  const tags = new Set([...(Array.isArray(a) ? [] : Object.keys(a)), ...(Array.isArray(b) ? [] : Object.keys(b))]);
  return Object.fromEntries([...tags].map((tag) => [tag, [...listFor(a, tag), ...listFor(b, tag)]]));
}

/** What a Block expects when it lands on `tag` (its own list for that outcome, or its list for every outcome). */
export function expectationsFor(block: SomeBlock, tag: string): readonly AnyExpectation[] {
  const list = expectOf(block);
  return list ? listFor(list, tag) : [];
}

/** The Blocks a Block's expectations name (Expect Blocks, or any Block used as one), for every outcome; not its Traits. */
export function expectedBlocks(block: SomeBlock): SomeBlock[] {
  const list = expectOf(block);
  if (!list) return [];
  const items = Array.isArray(list) ? list : Object.values(list as Readonly<Record<string, readonly AnyExpectation[] | undefined>>).flatMap((l) => l ?? []);
  return items.filter((item): item is SomeBlock => !isTrait(item));
}

/** One expectation in words: an Expect Block's description (or name), a check's `wants` (or name). */
const say = (item: AnyExpectation): string => (isTrait(item) ? (item.wants ?? item.name) : (item.description ?? item.name));

/** A Block's expectations in words, for a panel. */
export function describeExpectations(block: SomeBlock): string[] {
  const list = expectOf(block);
  if (!list) return [];
  if (Array.isArray(list)) return list.map(say);
  return Object.entries(list as Readonly<Record<string, readonly AnyExpectation[] | undefined>>).flatMap(([tag, items]) => (items ?? []).map((item) => `if ${tag}: ${say(item)}`));
}

function listFor(list: AnyExpectList, tag: string): readonly AnyExpectation[] {
  return Array.isArray(list) ? list : ((list as Readonly<Record<string, readonly AnyExpectation[] | undefined>>)[tag] ?? []);
}

/** Mem as an expectation sees it: it reads anything, and setting a key throws. */
function readOnlyMem(mem: MemPage, step: string): MemPage {
  return new Proxy(mem, {
    get(target, prop) {
      if (prop === "set") {
        return (key: { name: string }) => {
          throw new WaygraphError("WG_EXPECT_SET_MEM", MSG_EXPECT_SET_MEM(key.name, step));
        };
      }
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}

/** A check that changed the page or mem isn't a failed check: it stops the step, naming what it did. */
function loud<R extends { error?: unknown }>(result: R): R {
  if (result.error instanceof WaygraphError) throw result.error;
  return result;
}

const isTrait = (item: AnyExpectation): item is Trait => typeof (item as Trait).check === "function";

/** Checks one expectation; returns what failed (an Expect Block may fail several of its checks). */
async function check(item: AnyExpectation, out: Checkpoint<string>, page: Page, mem: MemPage): Promise<{ trait: Trait; saw?: string; of?: string }[]> {
  if (isTrait(item)) {
    const result = loud(await settle(item, page, mem));
    return result.ok ? [] : [{ trait: item, ...(result.saw ? { saw: result.saw } : {}) }];
  }
  try {
    await item.instruction.act(page, out, mem);
  } catch (error) {
    if (error instanceof WaygraphError) throw error;
    return [{ trait: { name: "ready", check: async () => false }, saw: error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error), of: item.name }];
  }
  const verify = item.instruction.verify;
  const traits = typeof verify === "function" ? verify(out) : (verify ?? []);
  const results = (await Promise.all(traits.map((trait) => settle(trait, page, mem)))).map(loud);
  return traits.flatMap((trait, i) => (results[i]?.ok ? [] : [{ trait, ...(results[i]?.saw ? { saw: results[i].saw } : {}), of: item.name }]));
}

/** How one expectation went after a step, for the demo: its words, whether it held, what it saw, what it looked at. */
export interface ExpectResult {
  text: string;
  ok: boolean;
  saw?: string;
  /** The elements its checks look at (an Expect Block's verify, a Trait's selector). */
  selectors: string[];
}

/** Each page's expectation results since the demo last took them. On globalThis: src and dist can share a page. */
const results: WeakMap<Page, ExpectResult[]> = ((globalThis as { [k: symbol]: WeakMap<Page, ExpectResult[]> | undefined })[
  Symbol.for("waygraph.expectResults")
] ??= new WeakMap());

/** How the page's last step's expectations went (the demo's checklist), once: taking them clears them. */
export function takeExpectResults(page: Page): ExpectResult[] {
  const list = results.get(page) ?? [];
  results.delete(page);
  return list;
}

/** The elements an expectation's checks look at. */
function selectorsOf(item: AnyExpectation, out: Checkpoint<string>): string[] {
  if (isTrait(item)) return item.selector ? [item.selector] : [];
  const verify = item.instruction.verify;
  const traits = typeof verify === "function" ? verify(out) : (verify ?? []);
  return traits.flatMap((t) => (t.selector ? [t.selector] : []));
}

/** Every expectation a step didn't meet: `checks` as data (the first is `check`), and one line each in the message. */
export class ExpectFailure extends Error {
  readonly check: TraitCheckReport;
  constructor(readonly checks: readonly TraitCheckReport[]) {
    const where = checks[0]?.url ? ` (on ${checks[0].url}${checks[0].heading ? ` "${checks[0].heading}"` : ""})` : "";
    const lines = checks.map((c) => `  - ${c.trait}: ${[c.wants && `wanted ${c.wants}`, c.saw && `saw ${c.saw}`].filter(Boolean).join("; ") || "didn't hold"}`);
    super(`${checks.length === 1 ? "an expectation" : `${checks.length} expectations`} failed after "${checks[0]?.block}"${where}\n${lines.join("\n")}`);
    this.name = "ExpectFailure";
    this.check = checks[0] as TraitCheckReport;
  }
}

/**
 * Runs a Block's expectations for the Checkpoint it landed on, after its verify passed: all at once, on a read-only page
 * and mem. Throws an {@link ExpectFailure} naming every one that didn't hold. `WAYGRAPH_NO_EXPECT` (`--no-expect`)
 * skips them.
 */
export async function runExpect(block: SomeBlock, out: Checkpoint<string>, page: Page, mem: MemPage, step: string = block.name): Promise<void> {
  const list = expectOf(block);
  if (!list || envFlag("WAYGRAPH_NO_EXPECT")) return;
  // A step its flow skipped (`when`) expects nothing.
  if ((block as { __waygraphSkipped?: (mem: MemPage) => boolean }).__waygraphSkipped?.(mem)) return;
  const items = expectationsFor(block, out.__state);
  if (items.length === 0) return;
  const perItem = await readOnlyWhile(page, step, async () => {
    const guarded = readOnlyMem(mem, step);
    return Promise.all(items.map((item) => check(item, out, page, guarded)));
  });
  results.set(
    page,
    items.map((item, i) => {
      const misses = perItem[i] ?? [];
      const saw = misses[0]?.saw;
      return { text: say(item), ok: misses.length === 0, ...(saw ? { saw } : {}), selectors: selectorsOf(item, out) };
    }),
  );
  const failed = perItem.flat();
  if (failed.length === 0) return;
  const where = await whereIs(page);
  throw new ExpectFailure(
    failed.map(({ trait, saw, of }) => ({
      trait: of ? `${of} › ${trait.name}` : trait.name,
      block: step,
      when: "expect",
      ...(trait.wants ? { wants: trait.wants } : {}),
      ...(saw ? { saw } : {}),
      ...where,
    })),
  );
}
