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
      // No explicit timeout - inherits whatever `page.setDefaultTimeout()`
      // is currently in effect (matching Trait.visible's own precedent),
      // rather than a hardcoded value. Real, confirmed bug this fixes: an
      // explicit `{ timeout: 8_000 }` here silently OVERRODE the much
      // shorter bound `engine.ts`'s own `locate()` sets via
      // `page.setDefaultTimeout()` while probing each NavBlock during
      // `detectHere` (used by resync and every raw click/type/goto/upload) -
      // a project with several `Trait.url` NavBlocks could take 8s PER
      // candidate that doesn't match, turning one resync/raw call into many
      // tens of seconds. Playwright's own ambient default (30s, unless
      // something narrowed it) still fails loud for the normal post-resolve
      // `verify()` case this was originally written for - just via the same
      // mechanism every other Trait already uses instead of its own
      // hardcoded, wrong-context value.
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

/**
 * Passes once at least one element matching `selector` is visible on the page,
 * waiting for it to appear. Uses `.first()` so list selectors (e.g. one row per
 * message/document) don't trip Playwright strict mode - the check means
 * "something matching is visible", not "the selector is unambiguous".
 */
export function visible(selector: string): Trait {
  return {
    name: `visible(${selector})`,
    async check(page) {
      await page.locator(selector).first().waitFor({ state: "visible" });
      return true;
    },
  };
}

/**
 * `visible`, scoped to a frame (e.g. a mail catcher's message-preview iframe)
 * instead of the top-level page. `page.locator(selector)` alone never reaches
 * inside an iframe - Playwright requires `frameLocator` for that - so
 * `Trait.visible` cannot express this on its own. `frameSelector` finds the
 * iframe itself; `innerSelector` is resolved inside it.
 * @example Trait.frameVisible("#preview-html", 'a[href*="verify"]')
 */
export function frameVisible(frameSelector: string, innerSelector: string): Trait {
  return {
    name: `frame-visible(${frameSelector}, ${innerSelector})`,
    async check(page) {
      await page.frameLocator(frameSelector).locator(innerSelector).first().waitFor({ state: "visible" });
      return true;
    },
  };
}

/** `textEquals`, scoped to a frame - see {@link frameVisible} for why this needs its own factory. */
export function frameTextEquals(frameSelector: string, innerSelector: string, expected: string): Trait {
  return {
    name: `frame-text-equals(${frameSelector}, ${innerSelector}, ${JSON.stringify(expected)})`,
    async check(page) {
      return (await page.frameLocator(frameSelector).locator(innerSelector).textContent()) === expected;
    },
  };
}

/**
 * Passes when `innerSelector`'s text inside `frameSelector` contains `expected`
 * as a substring - the common QA shape for "the email says X somewhere" without
 * needing to match the whole body verbatim (surrounding whitespace/markup in a
 * real email template would otherwise break an exact-equality check).
 * @example Trait.frameContains("#preview-html", "body", "Please verify your account")
 */
export function frameContainsText(frameSelector: string, innerSelector: string, expected: string): Trait {
  return {
    name: `frame-contains-text(${frameSelector}, ${innerSelector}, ${JSON.stringify(expected)})`,
    async check(page) {
      const text = await page.frameLocator(frameSelector).locator(innerSelector).textContent();
      return (text ?? "").includes(expected);
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
  frameVisible,
  frameText: frameTextEquals,
  frameContains: frameContainsText,
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

/**
 * Runs every Trait for a Block that's ABOUT to run, throwing on the first
 * failure with the failing Trait's own name and the Block's name - before
 * `act` ever touches the page, not after. `precondition` may be a flat list
 * or a function of the incoming Checkpoint (same shape `verify` already
 * takes of the resolved one). Called automatically by `connect()`/`runGraph`
 * right before a Block's own `act` - not something a Block normally calls
 * directly.
 */
export async function runPrecondition<In>(
  precondition: Trait[] | ((input: In) => Trait[]) | undefined,
  input: In,
  page: Page,
  mem: MemPage,
  blockName: string,
): Promise<void> {
  const traits = typeof precondition === "function" ? precondition(input) : (precondition ?? []);
  for (const trait of traits) {
    if (!(await trait.check(page, mem))) {
      throw new Error(`trait "${trait.name}" failed before "${blockName}"`);
    }
  }
}
