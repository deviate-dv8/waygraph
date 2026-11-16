// A Given Block: a precondition of a flow, made by code that has nothing to do with the page (a factory, SQL, a seed
// script, a CLI, a request). Played before the flow's first step by `map({ given })`; `undo` puts it back afterwards.
import { mark } from "../mark.js";
import { Start } from "../../checkpoint/checkpoint.js";
import { defineBlock } from "../block.js";
import type { DefinedBlock } from "../block.js";
import type { MemKey, MemPage } from "../../mem/mem.js";

export interface GivenBlockOptions {
  name: string;
  /** What must be true before the scenario starts, in the scenario's words: "a tenant exists with two projects". */
  description?: string;
  /** The mem keys `run` fills: the flow's steps may read them without the run supplying them. */
  sets?: readonly MemKey<unknown>[];
  /** Makes it, with any code. Keep what the steps need (an id, a name) in mem. */
  run: (mem: MemPage) => Promise<void> | void;
  /** Puts the world back; played after the flow, pass or fail, last given first. Its failure is reported, never the flow's. */
  undo?: (mem: MemPage) => Promise<void> | void;
  /** True when it is already there: `run` is skipped (and so is `undo`, it isn't this run's to remove). */
  ready?: (mem: MemPage) => Promise<boolean> | boolean;
}

function given(name: string, description: string | undefined, act: (mem: MemPage) => Promise<void> | void): DefinedBlock<never, never> {
  const built = defineBlock({
    name,
    ...(description ? { description } : {}),
    instruction: { act: async (_page: unknown, _input: unknown, mem: MemPage) => void (await act(mem)), resolve: () => Start },
  } as never) as unknown as DefinedBlock<never, never>;
  mark(built, "__waygraphKind", "given");
  mark(built, "__waygraphSalt", "given");
  return built;
}

/**
 * Declares a precondition. No page, no Checkpoint: it runs before the browser's first step and only touches mem.
 * @example defineGivenBlock({ name: "seed-tenant", sets: [TenantId], run: async (mem) => mem.set(TenantId, (await factories.tenant()).id), undo: (mem) => db.tenant.delete(mem.get(TenantId)) })
 */
export function defineGivenBlock(options: GivenBlockOptions): DefinedBlock<never, never> {
  const alreadyThere = new WeakSet<MemPage>();
  const built = given(options.name, options.description, async (mem) => {
    if (options.ready && (await options.ready(mem))) {
      alreadyThere.add(mem);
      return;
    }
    await options.run(mem);
  });
  if (options.sets) mark(built, "__waygraphProvides", options.sets);
  if (options.undo) {
    const undo = options.undo;
    mark(built, "__waygraphUndo", given(`undo-${options.name}`, undefined, (mem) => (alreadyThere.has(mem) ? undefined : undo(mem))));
  }
  return built;
}
