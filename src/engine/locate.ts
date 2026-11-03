// locate(): which Checkpoint is the page on right now, asked of the Nav Blocks' verifies.
import type { SomeBlock } from "./block/some-block.js";
import type { Page } from "@playwright/test";
import { MemPage } from "./mem/mem.js";
import { asResult } from "./trait/verify.js";

/**
 * "Where am I" - reverse-matches a live `page` against every NavBlock /
 * PageBlock in `library` (all at once), returning the first in order whose own `verify`
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
  library: readonly SomeBlock[],
  options?: { timeoutMs?: number },
): Promise<string | null> {
  const mem = new MemPage();
  const timeoutMs = options?.timeoutMs;
  if (timeoutMs !== undefined) {
    page.setDefaultTimeout(timeoutMs);
  }
  /** The candidate's Checkpoint when every one of its checks passes now, else null. A check that throws doesn't match. */
  const matches = async (block: SomeBlock): Promise<string | null> => {
    try {
      // A Nav / Page Block's resolve ignores what it's given (it always names its checkpoint), so it is safe before verify.
      const resolved = await block.instruction.resolve(undefined);
      const verify = block.instruction.verify;
      const traits = typeof verify === "function" ? verify(resolved) : (verify ?? []);
      for (const trait of traits) {
        // A probe: one look, no retries (verify's retries are for a page that is settling, not for guessing).
        if (!asResult(await trait.check(page, mem)).ok) return null;
      }
      return resolved.__state;
    } catch {
      return null;
    }
  };
  try {
    // Checks only read the page, so every candidate is asked at once: a page no candidate matches costs one wait, not
    // one per candidate. The first match in library order wins, as before.
    const found = await Promise.all(library.map(matches));
    return found.find((tag) => tag !== null) ?? null;
  } finally {
    if (timeoutMs !== undefined) {
      page.setDefaultTimeout(30_000);
    }
  }
}
