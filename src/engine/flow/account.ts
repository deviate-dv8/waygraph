// Accounts: a person the app knows, and the flow that signs them in. A flow that runs as one (`map({ as })`) starts
// signed in: the first time in a process the account's own sign-in flow runs and its session (cookies and storage) is
// kept; every later flow as that account starts from the kept session instead of signing in again.
import type { BrowserContext, Page } from "@playwright/test";
import type { SomeBlock } from "../block/some-block.js";
import { defineMethodBlock } from "../block/kinds/method.js";
import { checkpoint, type Checkpoint, type Start } from "../checkpoint/checkpoint.js";
import type { Flow } from "./flow.js";
import { clearSessionState } from "./flow.js";

/** A person the app knows: a name, and the flow that signs them in. */
export interface Account {
  readonly name: string;
  readonly signIn: Flow<Checkpoint<string>>;
}

/**
 * Declares an account: `name` is how runs and the demo call it; `signIn` is the flow that signs it in from a fresh
 * browser (its credentials come from mem, like any flow's).
 * @example
 * export const Planner = account("planner", { signIn: plannerSignInFlow });
 * export const addMachineFlow = engine.map({ as: Planner }).gotoPage(NavEquipmentBlock).method(AddMachineBlock).end();
 */
export function account(name: string, opts: { signIn: Flow<Checkpoint<string>> }): Account {
  return { name, signIn: opts.signIn };
}

type Session = Awaited<ReturnType<BrowserContext["storageState"]>>;

/** Each account's session, kept for the life of the process (one `waygraph run` / `demo` / `test` worker). */
const sessions = new Map<string, Session>();

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
  const requires = [...new Set(acc.signIn.blocks().flatMap((info) => info.block.requires ?? []))];
  return defineMethodBlock<Start, Start>({
    name: `sign-in-as-${acc.name}`,
    description: `Signs in as ${acc.name}: the session kept from the first sign-in in this run, or ${acc.name}'s sign-in flow.`,
    to: checkpoint("__start__"),
    ...(requires.length ? { requires } : {}),
    instruction: {
      async act(page, _input, mem) {
        await clearSessionState(page.context(), page);
        const kept = sessions.get(acc.name);
        if (kept) {
          await restore(page, kept);
          return;
        }
        await acc.signIn.run(page.context(), mem, { page });
        sessions.set(acc.name, await page.context().storageState());
      },
    },
  });
}
