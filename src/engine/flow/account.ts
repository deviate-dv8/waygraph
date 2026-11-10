// Accounts: a person the app knows, and the flow that signs them in. A flow that runs as one (`map({ as })`) starts
// signed in: the first time in a process the account's own sign-in flow runs and its session (cookies and storage) is
// kept; every later flow as that account starts from the kept session instead of signing in again. An account with a
// `ttl` keeps it only that long, and saves it for later processes too (saved-session.ts).
import type { Page } from "@playwright/test";
import type { SomeBlock } from "../block/some-block.js";
import { defineMethodBlock } from "../block/kinds/method.js";
import { Start, type Checkpoint } from "../checkpoint/checkpoint.js";
import type { Flow } from "./flow.js";
import { MemPage, type MemKey } from "../mem/mem.js";
import { clearSessionState } from "./flow.js";
import { durationMs, readSaved, writeSaved, type Duration, type Session, type TimedSession } from "./saved-session.js";

/** A person the app knows: a name, the flow that signs them in, and who they are (their data in mem). */
export interface Account {
  readonly name: string;
  readonly signIn: Flow<Checkpoint<string>>;
  /** Sets the person's own data (their email, their credentials) in mem, right before they sign in. */
  readonly mem?: ((mem: MemPage) => void) | undefined;
  /** How long a session stays signed in, ms: older, the account signs in again. Undefined: as long as the process. */
  readonly ttlMs?: number | undefined;
}

/**
 * Each sign-in flow's accounts, by the flow's steps (its Blocks' names in order): a project file can be imported twice
 * (a run imports a flow file fresh), so the same flow can be two objects. On globalThis: src and dist, or two installs,
 * can load in one process.
 */
const signingIn: Map<string, Account[]> = ((globalThis as { [k: symbol]: Map<string, Account[]> | undefined })[
  Symbol.for("waygraph.accountsBySignIn")
] ??= new Map());
const stepsOf = (flow: Flow<Checkpoint<string>>) => flow.blocks().map((info) => info.name).join(" > ");

/**
 * Declares an account: `name` is how runs and the demo call it; `signIn` is the flow that signs it in from a fresh
 * browser; `mem` says who the person is (their email, their credentials), set right before they sign in, so a flow `as`
 * the account needs nothing more. Without it, the sign-in flow's keys come from mem, like any flow's. `ttl` is how long
 * the app keeps a session signed in (`"15m"`, `"2h"`, or ms): a session older than that signs in again, and one still
 * good is saved (`.waygraph/sessions/`) for the next run and every test worker, so they don't sign in again either.
 * @example
 * export const Planner = account("planner", {
 *   signIn: magicLinkSignInFlow,
 *   mem: (m) => m.set(PiaKeys.expectedRecipient, { email: "kat@jbtec.example" }),
 *   ttl: "15m",
 * });
 * export const addMachineFlow = engine.map({ as: Planner }).gotoPage(NavEquipmentBlock).method(AddMachineBlock);
 */
export function account(name: string, opts: { signIn: Flow<Checkpoint<string>>; mem?: (mem: MemPage) => void; ttl?: Duration }): Account {
  const acc: Account = {
    name,
    signIn: opts.signIn,
    ...(opts.mem ? { mem: opts.mem } : {}),
    ...(opts.ttl !== undefined ? { ttlMs: durationMs(opts.ttl) } : {}),
  };
  // The same account declared again (its file imported twice) replaces itself.
  const key = stepsOf(opts.signIn);
  signingIn.set(key, [...(signingIn.get(key) ?? []).filter((a) => a.name !== name), acc]);
  return acc;
}

/** Every account declared so far (the project's `src/accounts/` once loaded), each once by name. */
export function allAccounts(): Account[] {
  return [...new Map([...signingIn.values()].flat().map((a) => [a.name, a])).values()];
}

/** The keys an account's `mem` sets: what a flow as it needn't be given. */
export function accountKeys(acc: Account): MemKey<unknown>[] {
  if (!acc.mem) return [];
  const scratch = new MemPage();
  acc.mem(scratch);
  return scratch.keys();
}

/**
 * The account a flow signs in, when it is the sign-in flow of exactly one account that says who it is: played on its
 * own (`waygraph demo loginLeadershipFlow`), it signs in as that person. A sign-in flow several accounts share says
 * nothing about which.
 */
export function accountSigningIn(flow: Flow<Checkpoint<string>>): Account | undefined {
  const [only, ...others] = signingIn.get(stepsOf(flow)) ?? [];
  return only?.mem && others.length === 0 ? only : undefined;
}

/**
 * Each account's session, kept for the life of the process (one `waygraph run` / `demo` / `test` worker), or until its
 * `ttl` runs out.
 */
const sessions = new Map<string, TimedSession>();

/** Who the account's person is, as text: the data its `mem` sets, so a saved session is only theirs. */
function personOf(acc: Account): string {
  if (!acc.mem) return "";
  const scratch = new MemPage();
  acc.mem(scratch);
  return JSON.stringify(scratch.keys().map((k) => [k.name, scratch.get(k)]));
}

/** Forgets every kept session: the next flow as each account signs in again. */
export function forgetSessions(): void {
  sessions.clear();
}

/** Puts a kept session into the browser: its cookies, and each origin's localStorage (set on a visit to that origin). */
async function restore(page: Page, session: Session): Promise<void> {
  await page.context().addCookies(session.cookies);
  for (const { origin, localStorage: items } of session.origins) {
    if (items.length === 0) continue;
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.evaluate((kept) => {
      for (const { name, value } of kept) localStorage.setItem(name, value);
    }, items);
  }
}

/**
 * The step a flow `as` an account starts with: a fresh session, then the account's kept one, or its sign-in flow the
 * first time (whose steps run inside this one). From the start, back to the start: the flow's own first step follows.
 */
export function signInStep(acc: Account): SomeBlock {
  // What the account says about the person isn't asked of the flow.
  const own = new Set(accountKeys(acc));
  const requires = [...new Set(acc.signIn.blocks().flatMap((info) => info.block.requires ?? []))].filter((k) => !own.has(k));
  return defineMethodBlock<Start, Start>({
    name: `sign-in-as-${acc.name}`,
    description: `Signs in as ${acc.name}: the session kept from the first sign-in in this run, or ${acc.name}'s sign-in flow.`,
    to: Start,
    ...(requires.length ? { requires } : {}),
    instruction: {
      async act(page, _input, mem) {
        await clearSessionState(page.context(), page);
        // Who's signed in is the account's person (in mem too), whoever an earlier flow in the run signed in as.
        acc.mem?.(mem);
        const now = Date.now();
        const person = personOf(acc);
        const held = sessions.get(acc.name);
        // Kept in this process and still good, else saved by an earlier one (an account with a ttl).
        const kept = held && held.expiresAt > now ? held : acc.ttlMs !== undefined ? readSaved(acc.name, person, now) : undefined;
        if (kept) {
          sessions.set(acc.name, kept);
          await restore(page, kept.state);
          return;
        }
        // Good from the moment the sign-in starts: a ttl counts from when the app signed the person in.
        await acc.signIn.run(page.context(), mem, { page });
        const session: TimedSession = { state: await page.context().storageState(), expiresAt: acc.ttlMs !== undefined ? now + acc.ttlMs : Infinity };
        sessions.set(acc.name, session);
        if (acc.ttlMs !== undefined) writeSaved(acc.name, person, session);
      },
    },
  });
}
