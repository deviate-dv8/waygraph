// A flow's preconditions (`map({ given: [Block] })`): Blocks that make the data the scenario needs, played before its
// first step, each with the Block that puts it back (`undo`), played after the flow in the reverse order.
import type { BrowserContext, Page } from "@playwright/test";
import type { MemPage } from "../mem/mem.js";
import type { SomeBlock } from "../block/some-block.js";
import { copyWaygraphRuntime } from "../block/block.js";
import { mark } from "../block/mark.js";
import { lastApiResult } from "../block/kinds/api.js";
import { MSG_GIVEN_FAILED, WaygraphError } from "../errors.js";
import type { EngineConfig } from "../config.js";
import type { buildFlow as BuildFlow } from "./flow.js";

/** A named, reusable list of preconditions (`engine.given(name, [...])`): flows list it in `given`, and it may hold other groups. */
export interface GivenGroup {
  readonly __waygraphGivenGroup: true;
  readonly name: string;
  readonly items: readonly (SomeBlock | GivenGroup)[];
}

export const isGivenGroup = (item: unknown): item is GivenGroup => (item as { __waygraphGivenGroup?: boolean } | null)?.__waygraphGivenGroup === true;

export function givenGroup(name: string, items: readonly (SomeBlock | GivenGroup)[]): GivenGroup {
  return { __waygraphGivenGroup: true, name, items };
}

/** The Blocks of a `given` list, groups opened, in order; a Block named twice plays once. A Block from a group remembers the group's name. */
export function flattenGiven(list: readonly (SomeBlock | GivenGroup)[], group?: string): SomeBlock[] {
  const seen = new Set<string>();
  const out: SomeBlock[] = [];
  const walk = (items: readonly (SomeBlock | GivenGroup)[], from: string | undefined): void => {
    for (const item of items) {
      if (isGivenGroup(item)) walk(item.items, item.name);
      else if (!seen.has(item.name)) {
        seen.add(item.name);
        out.push(from ? marked(item, "__waygraphGivenGroup", from) : item);
      }
    }
  };
  walk(list, group);
  return out;
}

/** The same Block with a marker set: its run events say what it is (`given` / `cleanup` on step:start). */
function marked(block: SomeBlock, key: string, value: unknown): SomeBlock {
  const next: SomeBlock = { ...block };
  copyWaygraphRuntime(block, next);
  mark(next, key, value);
  return next;
}

/** A precondition that is an API call and judges nothing itself fails on an answer that isn't a success: a seed that wasn't made must not pass. */
function mustSucceed(block: SomeBlock): SomeBlock {
  const ins = block.instruction;
  if ((block as { __waygraphKind?: string }).__waygraphKind !== "api" || ins.verify !== undefined) return block;
  const next: SomeBlock = {
    ...block,
    instruction: {
      ...ins,
      async observe(page, mem) {
        const seen = await ins.observe?.(page, mem);
        const answer = lastApiResult(mem);
        if (answer && !answer.ok) throw new Error(`it answered ${answer.status}`);
        return seen;
      },
    },
  };
  copyWaygraphRuntime(block, next);
  return next;
}

/** The givens, marked, and the Blocks that undo them: last given first, each a cleanup step that remembers whose it is. */
export function givenSteps(given: readonly SomeBlock[]): { given: SomeBlock[]; undo: SomeBlock[] } {
  const undo: SomeBlock[] = [];
  for (const block of given) {
    const back = (block as { __waygraphUndo?: SomeBlock }).__waygraphUndo;
    if (!back) continue;
    const step = marked(marked(back, "__waygraphCleanup", true), "__waygraphUndoOf", block.name);
    undo.unshift(step);
  }
  return { given: given.map((b) => marked(mustSucceed(b), "__waygraphGiven", true)), undo };
}

/** The name of the given a cleanup step undoes, if it is one's undo. */
export const undoOf = (block: SomeBlock): string | undefined => (block as { __waygraphUndoOf?: string }).__waygraphUndoOf;

/** What a failed given says: the flow was never played, so it is neither passed nor failed. */
export function givenFailed(name: string, error: unknown): WaygraphError {
  return new WaygraphError("WG_GIVEN_FAILED", MSG_GIVEN_FAILED(name, error instanceof Error ? error.message.split("\n")[0] ?? "" : String(error)));
}

/**
 * Plays the givens one by one on the flow's page, before its first step. `played` gets each name as it starts, so a given
 * that failed half way is still undone. The first failure stops the rest and is thrown as WG_GIVEN_FAILED.
 */
export async function runGiven(
  build: typeof BuildFlow,
  given: readonly SomeBlock[],
  played: Set<string>,
  context: BrowserContext,
  mem: MemPage,
  page: Page,
  config: EngineConfig,
): Promise<void> {
  for (const block of given) {
    played.add(block.name);
    try {
      await build([block], config).run(context, mem, { page, closeOnFinish: false });
    } catch (error) {
      throw givenFailed(block.name, error);
    }
  }
}
