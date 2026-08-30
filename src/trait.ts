import type { Page } from "@playwright/test";
import type { MemPage } from "./mem-page.js";

/**
 * A named, independently-reportable check. `check` never runs before `resolve` has
 * already decided the Checkpoint, and it can only confirm or fail loud - it has no
 * way to redirect the run.
 */
export interface Trait {
  /** Shows up in the error a failed check throws: `trait "${name}" failed after "${blockName}"`. */
  name: string;
  /** Returns `true` if the check passes. May wait (e.g. `page.waitForURL`) - just don't redirect the run. */
  check(page: Page, mem: MemPage): Promise<boolean>;
}

/**
 * Common, generic Trait factories - reusable across any Block, not one-off
 * `{ name, check }` objects written inline per Block. Reach for one of these
 * first; write a bespoke Trait only for a check that's genuinely app-specific.
 */

/**
 * Passes once the page's URL matches `pattern`, waiting for real navigation.
 * `pattern` is a structured `URLPatternInit` (the same shape the standard
 * `URLPattern` Web API takes) - `{ pathname, hostname, search, hash, ... }` -
 * not a hand-written regex. Whichever components you don't specify default to
 * "match anything" there, so a hybrid SPA tacking its own `?tab=cart&session=xyz`
 * onto the URL never breaks a `pathname`-only check - there's no separate flag
 * for that, omission already means "don't care." Reach for a bespoke Trait with
 * a raw regex only if a route genuinely needs pattern power `URLPatternInit`'s
 * fields can't express.
 * @example Trait.url({ pathname: "/inventory.html" })
 * @example Trait.url({ hostname: "checkout.example.com", pathname: "/pay" })
 * @example Trait.url({ pathname: "/users/:id" })   // named path params, matched structurally
 */
export function urlMatches(pattern: URLPatternInit): Trait {
  const urlPattern = new URLPattern(pattern);
  return {
    name: `url-matches(${JSON.stringify(pattern)})`,
    async check(page) {
      await page.waitForURL(urlPattern);
      return true;
    },
  };
}

/** Passes when `selector`'s text content is exactly `expected`. */
export function textEquals(selector: string, expected: string): Trait {
  return {
    name: `text-equals(${selector}, ${JSON.stringify(expected)})`,
    async check(page) {
      return (await page.locator(selector).textContent()) === expected;
    },
  };
}

/** Passes once `selector` is visible on the page, waiting for it to appear. */
export function visible(selector: string): Trait {
  return {
    name: `visible(${selector})`,
    async check(page) {
      await page.locator(selector).waitFor({ state: "visible" });
      return true;
    },
  };
}

/**
 * Discoverable entry point for the built-in Trait factories - type `Trait.` in
 * an editor to see `url`/`text`/`visible` offered, instead of needing to
 * already know `urlMatches`/`textEquals`/`visible` exist as free functions to
 * import by name. Same functions, just reachable off the type's own name -
 * `urlMatches`/`textEquals`/`visible` stay exported too, so nothing that
 * already imports them by name breaks.
 * @example verify: [Trait.url({ pathname: "/inventory.html" })]
 * @example verify: [Trait.text(".shopping_cart_badge", "1")]
 */
export const Trait = {
  url: urlMatches,
  text: textEquals,
  visible,
};

/**
 * Runs every Trait for a Block that just resolved, throwing on the first failure
 * with the failing Trait's own name and the Block's name - never called before
 * resolve, never able to change what resolve already decided. `verify` may be a
 * flat list or a function of the resolved Checkpoint (for a branching Block whose
 * different outcomes need different checks). Called automatically by `runGraph`
 * and `connect()` after every `resolve` - not something a Block normally calls
 * directly.
 */
export async function runVerify<Out>(
  verify: Trait[] | ((out: Out) => Trait[]) | undefined,
  out: Out,
  page: Page,
  mem: MemPage,
  blockName: string,
): Promise<void> {
  const traits = typeof verify === "function" ? verify(out) : (verify ?? []);
  for (const trait of traits) {
    if (!(await trait.check(page, mem))) {
      throw new Error(`trait "${trait.name}" failed after "${blockName}"`);
    }
  }
}
