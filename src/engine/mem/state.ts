// States: what the application is right now (signed in, a role, a cart with something in it), kept in mem as keys (a boolean, or
// one of a few words) the map can reason about, and per pane in a flow with panes (each person is in their own state). A key is a state when it is declared with `state(initial)` in its namespace; a page `needs` states to be
// reachable, a Method or link `sets` them when it lands. The run applies and checks them; the map and `check` read them.
import { mark } from "../block/mark.js";
import { WaygraphError } from "../errors.js";
import type { Checkpoint } from "../checkpoint/checkpoint.js";
import type { MemKey, MemPage } from "./mem.js";

/** What a state can be: on or off, or one of a few words (a role). */
export type StateValue = boolean | string;

/** A state change: the key and what it becomes. */
export type StateChange = readonly [key: MemKey<boolean>, value: boolean] | readonly [key: MemKey<string>, value: string];

/** What a page needs: a boolean state being on (the key), or a state being a value (`[Auth.role, "admin"]`). */
export type StateNeed = MemKey<boolean> | StateChange;

const asNeed = (need: StateNeed): readonly [MemKey<StateValue>, StateValue] => (Array.isArray(need) ? (need as readonly [MemKey<StateValue>, StateValue]) : [need as MemKey<StateValue>, true]);

/** What a Method or link sets when it lands: fixed, or by where it landed (a login that may stay on the login page). */
export type StateSets = readonly StateChange[] | ((landed: Checkpoint<string>) => readonly StateChange[]);

const MARK = Symbol.for("waygraph.state");
const initials: Map<MemKey<unknown>, StateValue> = ((globalThis as { [k: symbol]: Map<MemKey<unknown>, StateValue> | undefined })[Symbol.for("waygraph.states")] ??= new Map());
const needsByShell: Map<string, readonly StateNeed[]> = new Map();
const needsByPage: Map<string, readonly StateNeed[]> = ((globalThis as { [k: symbol]: Map<string, readonly StateNeed[]> | undefined })[Symbol.for("waygraph.pageNeeds")] ??= new Map());

/**
 * Declares a key of `keys(...)` as a state, with the value it has until something sets it.
 * @example export const Auth = keys("auth")<{ signedIn: boolean }>({ signedIn: state(false) });
 */
export function state<T extends StateValue>(initial: T): (ctx: { unique: string }) => T {
  return Object.assign(() => initial, { [MARK]: initial });
}

/** Records the state a stub declares (called by `keys`). */
export function registerState(key: MemKey<unknown>, stub: unknown): void {
  const initial = (stub as { [MARK]?: StateValue })[MARK];
  if (initial !== undefined) initials.set(key, initial);
}

/** Every declared state with its starting value, by key name. */
export function declaredStates(): { key: string; initial: StateValue }[] {
  return [...initials].map(([key, initial]) => ({ key: key.name, initial }));
}

const paneStore = new WeakMap<MemPage, Map<string, StateValue>>();

/** What `key` is right now: in a pane, what that pane's person set (else where it starts); otherwise what mem holds, else where it starts. */
export function stateNow(mem: MemPage, key: MemKey<StateValue>, pane?: string): StateValue {
  if (pane !== undefined) return paneStore.get(mem)?.get(`${pane}|${key.name}`) ?? initials.get(key) ?? false;
  return mem.has(key) ? mem.get(key) : (initials.get(key) ?? false);
}

/** Sets a state: in a pane's own store, or in mem. */
export function setState(mem: MemPage, key: MemKey<StateValue>, value: StateValue, pane?: string): void {
  if (pane === undefined) return void mem.set(key, value);
  const store = paneStore.get(mem) ?? new Map<string, StateValue>();
  store.set(`${pane}|${key.name}`, value);
  paneStore.set(mem, store);
}

/** Runs an account's `mem` on a scratch mem and puts the states it sets in `pane`'s own store. */
export function setStates(account: (mem: MemPage) => void, into: MemPage, pane: string): void {
  const scratch = new (into.constructor as new () => MemPage)();
  account(scratch);
  for (const [key, value] of statesIn(scratch)) setState(into, key, value, pane);
}

/** The declared states in `keys` (a MemPage's, an account's scratch mem): their current values. */
export function statesIn(mem: MemPage): [MemKey<StateValue>, StateValue][] {
  return mem.keys().filter((k) => initials.has(k)).map((k) => [k as MemKey<StateValue>, mem.get(k) as StateValue]);
}

/** The needs of a page that aren't met: as `key` (on) or `key=value`. */
export function unmetNeeds(tag: string, mem: MemPage, pane?: string): string[] {
  return needsFor(tag).flatMap((need) => {
    const [key, want] = asNeed(need);
    return stateNow(mem, key, pane) === want ? [] : [want === true ? key.name : `${key.name}=${String(want)}`];
  });
}

/** Says what a Block needs and sets, for the run and the manifest. */
export function markStates(block: object, states: { needs?: readonly StateNeed[] | undefined; sets?: StateSets | undefined }): void {
  if (states.needs?.length) mark(block, "__waygraphNeeds", states.needs);
  if (states.sets) mark(block, "__waygraphSets", states.sets);
}

/** The states a page needs to be reachable (registered by its Checkpoint, so every step that lands on it is checked). */
export function registerNeeds(page: string, needs: readonly StateNeed[] | undefined, shell = false): void {
  const into = shell ? needsByShell : needsByPage;
  if (needs?.length) into.set(page, needs);
  else if (!shell) into.delete(page); // a page defined again without `needs` has none: another project's page of that name must not inherit them
}

/** A Block's `sets` as data: each change, and for one that depends on where the step lands, the Checkpoint it is for. */
export function describeSets(block: object, to: readonly string[]): { key: string; value: StateValue; on?: string }[] {
  const sets = (block as { __waygraphSets?: StateSets }).__waygraphSets;
  if (sets === undefined) return [];
  if (typeof sets !== "function") return sets.map(([key, value]) => ({ key: key.name, value }));
  return to.flatMap((tag) => sets({ __state: tag } as Checkpoint<string>).map(([key, value]) => ({ key: key.name, value, on: tag })));
}

/** The states the page `tag` needs: its own and its shell's. */
export const needsFor = (tag: string): StateNeed[] => [...(needsByPage.get(tag) ?? []), ...(needsByShell.get(tag) ?? [])];

/** A copy of a Block keeps what it sets (markers aren't carried by a spread). */
export function copyStates(from: object, to: object): void {
  markStates(to, { sets: (from as { __waygraphSets?: StateSets }).__waygraphSets });
}

/** The key names a Block (a page, a shell) needs itself. */
export const needsOf = (block: object): string[] =>
  ((block as { __waygraphNeeds?: readonly StateNeed[] }).__waygraphNeeds ?? []).map((n) => {
    const [key, want] = asNeed(n);
    return want === true ? key.name : `${key.name}=${String(want)}`;
  });

/** A page's `needs`: marked on the Block and registered for its Checkpoint and, for a shell, the pages it names. */
export function declareNeeds(block: object, page: string | undefined, covers: unknown, needs: readonly StateNeed[] | undefined): void {
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
export function applyStates(block: object, landed: Checkpoint<string>, mem: MemPage, onSet?: (key: string, value: StateValue) => void, pane?: string): void {
  for (const [key, value] of setsOf(block, landed)) {
    setState(mem, key as MemKey<StateValue>, value, pane);
    onSet?.(key.name, value);
  }
  const missing = unmetNeeds(landed.__state, mem, pane);
  if (missing.length) throw new WaygraphError("WG_STATE_NEEDED", `${landed.__state} needs ${missing.join(", ")}, and ${pane ? `${pane} isn't` : "the flow isn't"} in ${missing.length === 1 ? "that state" : "those states"}: sign in first (an account's mem, or a step that sets it)`);
}
