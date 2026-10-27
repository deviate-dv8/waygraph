// What `map()` checks and wraps on each step: the Block's kind and origin, `{ ff, pace }`, a session reset.
import type { Page } from "@playwright/test";
import type { Checkpoint } from "../checkpoint/checkpoint.js";
import { type SomeBlock, type SomeDefinedBlock, copyWaygraphRuntime } from "../block/block.js";
import { MSG_MAP_LANDED_ELSEWHERE, MSG_MAP_LANDS_NOT_AN_OUTCOME, MSG_MAP_WRONG_KIND, MSG_MAP_WRONG_ORIGIN_EXTERNAL, MSG_MAP_WRONG_ORIGIN_INTERNAL, MSG_MAP_WRONG_SALT, WaygraphError } from "../errors.js";
import { MemPage } from "../mem/mem.js";
import type { DemoPace } from "../stub/pace.js";
import { clearSessionState } from "./flow.js";


/** The same Block, but it clears cookies and storage before it acts. Keeps the runtime markers. */
export function resetBefore(block: SomeBlock): SomeBlock {
  const act = block.instruction.act.bind(block.instruction);
  const next = {
    ...block,
    instruction: {
      ...block.instruction,
      async act(page: Page, input: unknown, mem: MemPage) {
        await clearSessionState(page.context(), page as unknown as Page);
        return (act as (p: unknown, i: unknown, m: MemPage) => unknown)(page, input, mem);
      },
    },
  } as SomeBlock;
  copyWaygraphRuntime(block, next);
  Object.defineProperty(next, "__waygraphResetBefore", { value: true, enumerable: false, configurable: true });
  return next;
}
/**
 * The same Block, narrowed to one of its outcomes: the flow continues from `lands`, and a run where the Block resolves
 * anywhere else fails at that step, naming both. A `lands` the Block never declares is rejected when the flow is built.
 */
export function landsOn(block: SomeDefinedBlock, lands: Checkpoint<string> | undefined): SomeDefinedBlock {
  if (!lands) return block;
  const outcomes = (block as { __waygraphTo?: readonly string[] }).__waygraphTo;
  if (outcomes?.length && !outcomes.includes(lands.__state)) {
    throw new WaygraphError("WG_MAP_LANDS", MSG_MAP_LANDS_NOT_AN_OUTCOME(block.name, lands.__state, outcomes));
  }
  const resolve = block.instruction.resolve.bind(block.instruction);
  const next = {
    ...block,
    instruction: {
      ...block.instruction,
      async resolve(observed: unknown) {
        const landed = await (resolve as (o: unknown) => Checkpoint<string> | Promise<Checkpoint<string>>)(observed);
        if (landed.__state !== lands.__state) {
          throw new WaygraphError("WG_MAP_LANDS", MSG_MAP_LANDED_ELSEWHERE(block.name, landed.__state, lands.__state));
        }
        return landed;
      },
    },
  } as SomeDefinedBlock;
  copyWaygraphRuntime(block, next);
  return next;
}
/** Applies a step's `pace` option, keeping the Block's runtime markers. */
export function paced(block: object, opts: MapStepOpts | undefined): SomeDefinedBlock {
  if (opts?.pace === undefined) return block as SomeDefinedBlock;
  const next = { ...block, demoPace: opts.pace } as SomeDefinedBlock;
  copyWaygraphRuntime(block as SomeDefinedBlock, next);
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
  assert: "defineAssertBlock",
};
export const MAP_SALT_FACTORY_HINT: Record<string, string> = {
  method: "defineMethodBlock",
  effect: "defineEffectBlock",
  api: "defineApiBlock",
};
/** Per-step options for the map builder: `ff` fast-forwards the step, `pace` sets its demo pace. */

export interface MapStepOpts<Lands extends Checkpoint<string> = Checkpoint<string>> {
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
}
