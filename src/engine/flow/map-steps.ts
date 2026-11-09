// What `map()` checks and wraps on each step: the Block's kind and origin, `{ ff, pace }`, a session reset.
import { mark } from "../block/mark.js";
import { checkpoint, type Checkpoint } from "../checkpoint/checkpoint.js";
import type { MemKey } from "../mem/mem.js";
import { expectedValue, type Expected, type Trait } from "../trait/trait.js";
import type { Page } from "@playwright/test";
import { defineMethodBlock } from "../block/kinds/method.js";
import { settlePage } from "../read/run-read.js";
import { copyWaygraphRuntime } from "../block/block.js";
import type { ExpectList } from "../block/kinds/expect.js";
import { withExpect } from "../run/expect.js";
import type { SomeBlock } from "../block/some-block.js";
import { MSG_MAP_LANDED_ELSEWHERE, MSG_MAP_LANDS_NOT_AN_OUTCOME, MSG_MAP_WRONG_KIND, MSG_MAP_WRONG_ORIGIN_EXTERNAL, MSG_MAP_WRONG_ORIGIN_INTERNAL, MSG_MAP_WRONG_SALT, WaygraphError } from "../errors.js";
import { MemPage } from "../mem/mem.js";
import type { DemoPace } from "../stub/pace.js";
import { clearSessionState } from "./flow.js";


/** The same Block, but it clears cookies and storage before it acts. Keeps the runtime markers. */
export function resetBefore(block: SomeBlock): SomeBlock {
  const ins = block.instruction;
  const next: SomeBlock = {
    ...block,
    instruction: {
      ...ins,
      async act(page, input, mem) {
        await clearSessionState(page.context(), page);
        await ins.act(page, input, mem);
      },
    },
  };
  copyWaygraphRuntime(block, next);
  mark(next, "__waygraphResetBefore", true);
  return next;
}
/**
 * The same Block, narrowed to one of its outcomes: the flow continues from `lands`, and a run where the Block resolves
 * anywhere else fails at that step, naming both. A `lands` the Block never declares is rejected when the flow is built.
 */
export function landsOn(block: SomeBlock, lands: Checkpoint<string> | undefined): SomeBlock {
  if (!lands) return block;
  const outcomes = (block as { __waygraphTo?: readonly string[] }).__waygraphTo;
  if (outcomes?.length && !outcomes.includes(lands.__state)) {
    throw new WaygraphError("WG_MAP_LANDS", MSG_MAP_LANDS_NOT_AN_OUTCOME(block.name, lands.__state, outcomes));
  }
  const ins = block.instruction;
  const next: SomeBlock = {
    ...block,
    instruction: {
      ...ins,
      async resolve(observed) {
        const landed = await ins.resolve(observed);
        if (landed.__state !== lands.__state) {
          throw new WaygraphError("WG_MAP_LANDS", MSG_MAP_LANDED_ELSEWHERE(block.name, landed.__state, lands.__state));
        }
        return landed;
      },
    },
  };
  copyWaygraphRuntime(block, next);
  return next;
}
/** The same Block, also requiring `key` (a flow's input is required by its first step, so preflight asks for it). */
export function requiring(block: SomeBlock, key: MemKey<unknown>): SomeBlock {
  const next: SomeBlock = { ...block, requires: [...(block.requires ?? []).filter((k) => k !== key), key] };
  copyWaygraphRuntime(block, next);
  return next;
}

/** The same Block, no longer requiring `key` (a step before it supplies it). */
export function withoutRequire(block: SomeBlock, key: MemKey<unknown>): SomeBlock {
  if (!block.requires?.includes(key)) return block;
  const next: SomeBlock = { ...block, requires: (block.requires ?? []).filter((k) => k !== key) };
  copyWaygraphRuntime(block, next);
  return next;
}

/** Marks what a step that ends where it started saw, for its resolve (observe -> resolve is the only channel). */
interface Stayed {
  readonly __wgStayedAt: Checkpoint<string>;
}
const stayedAt = (observed: unknown): Checkpoint<string> | undefined =>
  (observed as Stayed | null | undefined)?.__wgStayedAt;

/**
 * The same Block, played only when `when(mem)` is true; otherwise it ends at once where it started, without acting,
 * observing or verifying. For a step that stays on its Checkpoint (`map()` only offers `when` there). The decision is
 * kept per run (by its mem): Blocks are shared, runs may be parallel.
 */
export function skippable(block: SomeBlock, when: ((mem: MemPage) => boolean) | undefined): SomeBlock {
  if (!when) return block;
  const skipped = new WeakMap<MemPage, Checkpoint<string>>();
  const ins = block.instruction;
  const keepTrait = (t: Trait): Trait => ({ ...t, check: async (page, mem) => (skipped.has(mem) ? true : t.check(page, mem)) });
  const verify = ins.verify;
  const next: SomeBlock = {
    ...block,
    instruction: {
      ...ins,
      async act(page, input, mem) {
        if (!when(mem)) {
          skipped.set(mem, input);
          return;
        }
        skipped.delete(mem);
        await ins.act(page, input, mem);
      },
      async observe(page, mem) {
        const at = skipped.get(mem);
        if (at) return { __wgStayedAt: at } satisfies Stayed;
        return ins.observe ? ins.observe(page, mem) : undefined;
      },
      resolve(observed) {
        return stayedAt(observed) ?? ins.resolve(observed);
      },
      ...(verify
        ? { verify: typeof verify === "function" ? (out: Checkpoint<string>) => verify(out).map(keepTrait) : verify.map(keepTrait) }
        : {}),
    },
  };
  copyWaygraphRuntime(block, next);
  // A skipped step's expectations are skipped too (runExpect asks).
  mark(next, "__waygraphSkipped", (mem: MemPage) => skipped.has(mem));
  return next;
}

/**
 * A step that ends where it started, doing `act` without touching the page's position: setting a key, checking what the
 * page shows. Its route is `*` -> where it was, so it fits after any step.
 */
function stayingStep(name: string, description: string, act: (page: Page, mem: MemPage) => Promise<void> | void, verify?: Trait[]): SomeBlock {
  const at = new WeakMap<MemPage, Checkpoint<string>>();
  return defineMethodBlock<Checkpoint<string>, Checkpoint<string>>({
    name,
    description,
    to: checkpoint("*"),
    instruction: {
      async act(page, input, mem) {
        await act(page, mem);
        at.set(mem, input);
      },
      observe: async (_page, mem) => {
        const here = at.get(mem);
        return here ? ({ __wgStayedAt: here } satisfies Stayed) : undefined;
      },
      resolve: (observed) => {
        const here = stayedAt(observed);
        if (!here) throw new Error(`waygraph: "${name}" resolved before it acted`);
        return here;
      },
      ...(verify ? { verify } : {}),
    },
  });
}

/** A step that sets a flow's input: what `.flow(sub, { input })` puts before the sub-flow. */
export function settingInput(key: MemKey<unknown>, value: unknown, flowName: string): SomeBlock {
  return stayingStep(`input-${flowName}`, `Gives the next flow its input (${key.name}).`, (_page, mem) => void mem.set(key, value));
}

/** `.set(key, value)`: a step that sets `key` (a value, or one worked out from mem when the step runs). */
export function settingKey<T>(key: MemKey<T>, value: Expected<T>): SomeBlock {
  return stayingStep(`set-${key.name}`, `Sets ${key.name}.`, (_page, mem) => void mem.set(key, expectedValue(value, mem)));
}

/** The same Block with a step's `expect` option applied (see {@link MapStepOpts.expect}). */
export function stepExpect<Out extends Checkpoint<string>>(block: SomeBlock, expect: false | ExpectList<Out> | undefined): SomeBlock {
  return expect === undefined ? block : withExpect(block, expect as Parameters<typeof withExpect>[1]);
}

/** The same Block, marked as a cleanup step: its run events say so (`cleanup: true` on step:start). */
export function asCleanup(block: SomeBlock): SomeBlock {
  const next: SomeBlock = { ...block };
  copyWaygraphRuntime(block, next);
  mark(next, "__waygraphCleanup", true);
  return next;
}
/** The same Block, waiting for the page to settle after it acts (the `settle` step option). */
export function settling(block: SomeBlock, settle: MapStepOpts["settle"]): SomeBlock {
  if (!settle) return block;
  const { quietMs = 300, maxMs = 5000 } = settle === true ? {} : settle;
  const ins = block.instruction;
  const next: SomeBlock = {
    ...block,
    instruction: {
      ...ins,
      async act(page, input, mem) {
        await ins.act(page, input, mem);
        await settlePage(page, quietMs, maxMs);
      },
    },
  };
  copyWaygraphRuntime(block, next);
  return next;
}

/** Applies a step's `pace` option, keeping the Block's runtime markers. */
export function paced(block: SomeBlock, opts: { pace?: DemoPace | undefined } | undefined): SomeBlock {
  if (opts?.pace === undefined) return block;
  const next: SomeBlock = { ...block, demoPace: opts.pace };
  copyWaygraphRuntime(block, next);
  return next;
}
export function mapKindOf(block: unknown): string | undefined {
  return (block as { __waygraphKind?: string; } | null | undefined)?.__waygraphKind;
}
export function mapSaltOf(block: unknown): string | undefined {
  return (block as { __waygraphSalt?: string; } | null | undefined)?.__waygraphSalt;
}
export function mapNavUrlOf(block: unknown): string | undefined {
  const url = (block as { __waygraphNavUrl?: unknown; } | null | undefined)?.__waygraphNavUrl;
  return typeof url === "string" ? url : undefined;
}
export function assertMapKind(block: SomeBlock, allowed: readonly string[], method: string): void {
  const kind = mapKindOf(block);
  if (kind !== undefined && allowed.includes(kind)) return;
  const wanted = allowed.map((k) => MAP_KIND_FACTORY_HINT[k] ?? k).join(" or ");
  const found = kind ? `a Block of kind "${kind}"` : "an object with no waygraph kind marker at all";
  throw new WaygraphError("WG_MAP_WRONG_KIND", MSG_MAP_WRONG_KIND(method, block?.name ?? "?", wanted, found));
}
export function assertMapSalt(block: SomeBlock, allowed: readonly string[], method: string): void {
  const salt = mapSaltOf(block);
  if (salt !== undefined && allowed.includes(salt)) return;
  const wanted = allowed.map((s) => MAP_SALT_FACTORY_HINT[s] ?? s).join(" or ");
  const found = salt ? `a Block salted "${salt}"` : "an object with no waygraph salt marker at all";
  throw new WaygraphError("WG_MAP_WRONG_SALT", MSG_MAP_WRONG_SALT(method, block?.name ?? "?", wanted, found));
}
export function assertMapOrigin(
  block: SomeBlock,
  homeOrigin: string | undefined,
  expect: "internal" | "external",
  method: string): void {
  if (!homeOrigin) return; // not configured - can't validate, honest no-op
  const navUrl = mapNavUrlOf(block);
  if (navUrl === undefined) return; // click-based/dynamic nav - not statically checkable
  let targetOrigin: string;
  let wantOrigin: string;
  try {
    targetOrigin = new URL(navUrl, homeOrigin).origin;
    wantOrigin = new URL(homeOrigin).origin;
  } catch {
    return; // malformed URL - not this check's job to validate that
  }
  const isExternal = targetOrigin !== wantOrigin;
  if (expect === "internal" && isExternal) {
    throw new WaygraphError("WG_MAP_WRONG_ORIGIN", MSG_MAP_WRONG_ORIGIN_INTERNAL(block.name, targetOrigin, wantOrigin));
  }
  if (expect === "external" && !isExternal) {
    throw new WaygraphError("WG_MAP_WRONG_ORIGIN", MSG_MAP_WRONG_ORIGIN_EXTERNAL(block.name, targetOrigin, wantOrigin));
  }
}
export const MAP_KIND_FACTORY_HINT: Record<string, string> = {
  nav: "defineNavBlock/defineMemNavBlock",
  page: "definePageBlock",
  expect: "defineExpectBlock",
};
export const MAP_SALT_FACTORY_HINT: Record<string, string> = {
  method: "defineMethodBlock",
  api: "defineApiBlock",
};
/** Per-step options for the map builder: `ff` fast-forwards the step, `pace` sets its demo pace. */

export interface MapStepOpts<Lands extends Checkpoint<string> = Checkpoint<string>> {
  /**
   * What this step's scenario expects after it, on top of what the Block itself expects: Expect Blocks, Traits,
   * `Key.is(...)`. Per outcome for a Block that can land in several places. `false` drops the Block's own
   * expectations for this step (its verify still runs).
   * @example .method(ConfirmArchiveBlock, { expect: [ExpectArchivedToastBlock, Machine.status.is("Archived")] })
   */
  expect?: false | ExpectList<Lands>;
  /**
   * Which of a branching Block's outcomes this flow continues from. The flow is typed from it, and a run where the Block
   * lands anywhere else fails at this step.
   * @example map().method(SubmitLoginBlock, { lands: LoggedIn }).gotoPage(NavCartBlock)
   */
  lands?: Lands;
  /**
   * Fast-forward just this step, inline - no `.ffStart()/.ffEnd()` bracket needed. Consecutive
   * `{ ff: true }` steps merge into ONE fast-forward block, same result as the explicit bracket
   * form; a step without the flag closes an auto-opened window first.
   * @example map().gotoPage(NavLoginBlock, { ff: true }).method(FillUsernameBlock, { ff: true })
   */
  ff?: boolean;
  /**
   * Demo pace for just this step (`"blitz"` skips the typing animation and the pause after the action; `"fast"`, `"slow"`,
   * or a number scale the narration gates).
   * @example map().method(SetBearerTokenBlock, { pace: "blitz" })
   */
  pace?: DemoPace;
  /**
   * Play this step only when `when(mem)` is true; otherwise it ends at once where it started. For a step that stays on
   * its Checkpoint (filling an optional field): one flow covers the cases that differ by it.
   * @example .method(SetJsonBodyBlock, { when: (mem) => mem.has(RequestBody) })
   */
  when?: (mem: MemPage) => boolean;
  /**
   * Wait for the page to settle after this step acts, before it is checked: loaded, then no DOM change for `quietMs`
   * (default 300), at most `maxMs` (default 5000). For a debounced search or a list that renders in bursts, instead of a
   * fixed `waitForTimeout`.
   * @example .method(TypeSearchBlock, { settle: true }) · { settle: { quietMs: 600 } }
   */
  settle?: true | { quietMs?: number; maxMs?: number };
}
