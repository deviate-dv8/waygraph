// States: what the application is right now (signed in, a cart with something in it), kept in mem as boolean keys the map can
// reason about. A key is a state when it is declared with `state(initial)` in its namespace; a page `needs` states to be
// reachable, a Method or link `sets` them when it lands. The run applies and checks them; the map and `check` read them.
import { mark } from "../block/mark.js";
import { WaygraphError } from "../errors.js";
import type { Checkpoint } from "../checkpoint/checkpoint.js";
import type { MemKey, MemPage } from "./mem.js";

/** A state change: the key and what it becomes. */
export type StateChange = readonly [key: MemKey<boolean>, value: boolean];

/** What a Method or link sets when it lands: fixed, or by where it landed (a login that may stay on the login page). */
export type StateSets = readonly StateChange[] | ((landed: Checkpoint<string>) => readonly StateChange[]);

const MARK = Symbol.for("waygraph.state");
const initials: Map<MemKey<unknown>, boolean> = ((globalThis as { [k: symbol]: Map<MemKey<unknown>, boolean> | undefined })[Symbol.for("waygraph.states")] ??= new Map());
const needsByShell: Map<string, readonly MemKey<boolean>[]> = new Map();
const needsByPage: Map<string, readonly MemKey<boolean>[]> = ((globalThis as { [k: symbol]: Map<string, readonly MemKey<boolean>[]> | undefined })[Symbol.for("waygraph.pageNeeds")] ??= new Map());

/**
 * Declares a key of `keys(...)` as a state, with the value it has until something sets it.
 * @example export const Auth = keys("auth")<{ signedIn: boolean }>({ signedIn: state(false) });
 */
export function state(initial: boolean): (ctx: { unique: string }) => boolean {
  return Object.assign(() => initial, { [MARK]: initial });
}

/** Records the state a stub declares (called by `keys`). */
export function registerState(key: MemKey<unknown>, stub: unknown): void {
  const initial = (stub as { [MARK]?: boolean })[MARK];
  if (initial !== undefined) initials.set(key, initial);
}

/** Every declared state with its starting value, by key name. */
export function declaredStates(): { key: string; initial: boolean }[] {
  return [...initials].map(([key, initial]) => ({ key: key.name, initial }));
}

/** Whether `key` is a state right now: what mem holds, else the value it was declared with. */
export function stateNow(mem: MemPage, key: MemKey<boolean>): boolean {
  return mem.has(key) ? mem.get(key) : (initials.get(key) ?? false);
}

/** Says what a Block needs and sets, for the run and the manifest. */
export function markStates(block: object, states: { needs?: readonly MemKey<boolean>[] | undefined; sets?: StateSets | undefined }): void {
  if (states.needs?.length) mark(block, "__waygraphNeeds", states.needs);
  if (states.sets) mark(block, "__waygraphSets", states.sets);
}

/** The states a page needs to be reachable (registered by its Checkpoint, so every step that lands on it is checked). */
export function registerNeeds(page: string, needs: readonly MemKey<boolean>[] | undefined, shell = false): void {
  const into = shell ? needsByShell : needsByPage;
  if (needs?.length) into.set(page, needs);
  else if (!shell) into.delete(page); // a page defined again without `needs` has none: another project's page of that name must not inherit them
}

/** A Block's `sets` as data: each change, and for one that depends on where the step lands, the Checkpoint it is for. */
export function describeSets(block: object, to: readonly string[]): { key: string; value: boolean; on?: string }[] {
  const sets = (block as { __waygraphSets?: StateSets }).__waygraphSets;
  if (sets === undefined) return [];
  if (typeof sets !== "function") return sets.map(([key, value]) => ({ key: key.name, value }));
  return to.flatMap((tag) => sets({ __state: tag } as Checkpoint<string>).map(([key, value]) => ({ key: key.name, value, on: tag })));
}

/** A copy of a Block keeps what it sets (markers aren't carried by a spread). */
export function copyStates(from: object, to: object): void {
  markStates(to, { sets: (from as { __waygraphSets?: StateSets }).__waygraphSets });
}

/** The key names a Block (a page, a shell) needs itself. */
export const needsOf = (block: object): string[] => ((block as { __waygraphNeeds?: readonly MemKey<boolean>[] }).__waygraphNeeds ?? []).map((k) => k.name);

/** A page's `needs`: marked on the Block and registered for its Checkpoint and, for a shell, the pages it names. */
export function declareNeeds(block: object, page: string | undefined, covers: unknown, needs: readonly MemKey<boolean>[] | undefined): void {
  markStates(block, { needs });
  if (page !== undefined) registerNeeds(page, needs);
  if (Array.isArray(covers)) for (const tag of covers as string[]) registerNeeds(tag, needs, true);
}


/** What `block` sets when it lands on `landed`. */
export function setsOf(block: object, landed: Checkpoint<string>): readonly StateChange[] {
  const sets = (block as { __waygraphSets?: StateSets }).__waygraphSets;
  return typeof sets === "function" ? sets(landed) : (sets ?? []);
}

/**
 * After a step landed: the states it sets are set (`onSet` hears each change), then the page it landed on must have the states
 * it needs. A page opened without its state (a dashboard signed out) fails the step, naming the state and who gives it.
 */
export function applyStates(block: object, landed: Checkpoint<string>, mem: MemPage, onSet?: (key: string, value: boolean) => void): void {
  for (const [key, value] of setsOf(block, landed)) {
    mem.set(key, value);
    onSet?.(key.name, value);
  }
  const missing = [...(needsByPage.get(landed.__state) ?? []), ...(needsByShell.get(landed.__state) ?? [])].filter((key) => !stateNow(mem, key));
  if (missing.length) throw new WaygraphError("WG_STATE_NEEDED", `${landed.__state} needs ${missing.map((k) => k.name).join(", ")}, and the flow isn't in ${missing.length === 1 ? "that state" : "those states"}: sign in first (an account's mem, or a step that sets it)`);
}
