// Split out of the former 2,900-line engine.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import type { NavBlock } from "./blocks/nav.js";
import type { Page } from "@playwright/test";
import { MemPage } from "../mem-page.js";

/**
 * "Where am I" - reverse-matches a live `page` against every NavBlock /
 * PageBlock in `library`, in order, returning the first one whose own `verify`
 * Traits all pass (its `checkpoint`), or `null` if none match. Deliberately
 * Nav/Page hubs only: each has exactly one fixed `checkpoint` and a `verify`
 * list whose whole job is already "confirm arrival here," so it's a reliable
 * fingerprint - a regular `defineBlock` can branch to different `Out` tags
 * depending on runtime evidence, so its `verify` alone doesn't identify a
 * single state the way a hub's does.
 *
 * The primitive `waygraph auto`'s discovered graph is *for* - the graph says
 * what pages exist and how to reach them; `locate()` is how an autonomous
 * run figures out which one it's actually looking at right now, without a
 * human telling it.
 *
 * More than one NavBlock matching is a real possibility (two Checkpoints
 * whose `verify` Traits are both satisfied by the same page) - `locate()`
 * returns the first match rather than treating that as an error; resolving
 * genuine ambiguity is a follow-up, not solved here.
 * @example const here = await locate(page, [NavLoginBlock, NavDashboardBlock]);
 */
export async function locate(
  page: Page,
  library: readonly NavBlock<any>[],
  options?: { timeoutMs?: number },
): Promise<string | null> {
  const mem = new MemPage();
  const timeoutMs = options?.timeoutMs;
  if (timeoutMs !== undefined) {
    page.setDefaultTimeout(timeoutMs);
  }
  try {
    for (const block of library) {
      try {
        // NavBlock's own resolve() ignores whatever it's called with - always
        // exactly `checkpoint(options.checkpoint)` - so this is safe to call
        // before verify, unlike a regular Block where resolve depends on
        // observed evidence.
        const resolved = await block.instruction.resolve(undefined as never);
        const verify = block.instruction.verify;
        const traits = typeof verify === "function" ? verify(resolved) : (verify ?? []);
        let allPass = true;
        for (const trait of traits) {
          // eslint-disable-next-line no-await-in-loop
          if (!(await trait.check(page, mem))) {
            allPass = false;
            break;
          }
        }
        if (allPass) return resolved.__state;
      } catch {
        // This NavBlock's own verify threw (e.g. a waitFor timing out) -
        // treat that the same as "didn't match," try the next candidate.
      }
    }
    return null;
  } finally {
    if (timeoutMs !== undefined) {
      page.setDefaultTimeout(30_000);
    }
  }
}
