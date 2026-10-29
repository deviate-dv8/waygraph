// Traits: the checks a Block's verify runs against the page (url, text, visible, ...), and the runner for them.
import { readKeyNow } from "../read/read-block.js";
import type { ReadKey } from "../read/read-key.js";
import type { Page } from "@playwright/test";
import type { MemPage } from "../mem/mem.js";
// URLPattern is only a Node global from v23.8+ (and even then, Node's own, not a browser's) -
// Node 22 (the oldest supported) has no global at all. Side-effect import only: the polyfill package sets
// globalThis.URLPattern itself, but only when one doesn't already exist - so below Node 23.8 this
// becomes THE global, and from 23.8 up it's a no-op and the native one stays. Playwright's own
// waitForURL(pattern) checks `pattern instanceof globalThis.URLPattern` internally, so the instance
// constructed below must always come from whatever ends up on globalThis, not this import
// directly - a named `import { URLPattern }` gives a fixed class that's a different constructor
// than the native global on newer Node, and `instanceof` would then fail on those versions.
import "urlpattern-polyfill";

/**
 * A named, independently-reportable check. `check` never runs before `resolve` has
 * already decided the Checkpoint, and it can only confirm or fail loud - it has no
 * way to redirect the run.
 */
export interface Trait {
  /** Shows up in the error a failed check throws: `trait "${name}" failed after "${blockName}"`. */
  name: string;
  /** What the check is looking for, in words (`"Saved" in .toast`): the failure says it. */
  wants?: string;
  /**
   * Passes or not. Return `{ ok, saw }` to say what the page showed when it doesn't pass: the failure says it. May wait
   * (e.g. `page.waitForURL`) - just don't redirect the run. A check that doesn't wait is retried until it passes or
   * `timeoutMs` runs out, so a page still settling doesn't fail it.
   */
  check(page: Page, mem: MemPage): Promise<boolean | TraitResult>;
  /** How long verify keeps retrying this check, ms (default 5000). */
  timeoutMs?: number;
  /** The element the check looks at, when it looks at one: the demo rings it after the step. */
  selector?: string;
}

/** A check's answer with what it saw: `{ ok: false, saw: '"Draft"' }`. */
export interface TraitResult {
  ok: boolean;
  saw?: string;
}

/** A value a Trait compares against: fixed, or read from mem when the check runs. */
export type Expected<T> = T | ((mem: MemPage) => T);

const expectedValue = <T>(expected: Expected<T>, mem: MemPage): T =>
  typeof expected === "function" ? (expected as (mem: MemPage) => T)(mem) : expected;

/** What a selector's first match reads (text collapsed), or that nothing matched. */
async function textAt(page: Page, selector: string): Promise<string | undefined> {
  const loc = page.locator(selector).first();
  if ((await loc.count()) === 0) return undefined;
  return ((await loc.textContent()) ?? "").replace(/\s+/g, " ").trim();
}

const shown = (text: string | undefined): string => (text === undefined ? "nothing matched" : JSON.stringify(text));

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
      // Cast, not a bare `urlPattern` reference: @types/node and the polyfill both declare an
      // ambient global `URLPattern` (`skipLibCheck` hides the conflict between them instead of
      // erroring), and they resolve to two DIFFERENT types depending on where in the program the
      // name is looked up - so the very same runtime value that satisfies Playwright's actual
      // (structural, .test()-based) check at runtime fails typechecking as "not assignable" against
      // whichever of the two ambient declarations Playwright's own .d.ts happens to see.
      await page.waitForURL(urlPattern as unknown as Parameters<Page["waitForURL"]>[0]);
      return true;
    },
  };
}

/**
 * Passes when `selector`'s text (whitespace collapsed) is exactly `expected` - a fixed string, or one read from mem.
 * @example Trait.text(".toast", "Saved")
 * @example Trait.text("[data-testid=code]", (mem) => mem.get(Machine.code))
 */
export function textEquals(selector: string, expected: Expected<string>): Trait {
  return {
    name: `text-equals(${selector}, ${typeof expected === "string" ? JSON.stringify(expected) : "from mem"})`,
    selector,
    wants: typeof expected === "string" ? `${JSON.stringify(expected)} in ${selector}` : `the mem value in ${selector}`,
    async check(page, mem) {
      const want = expectedValue(expected, mem);
      const text = await textAt(page, selector);
      return { ok: text === want.replace(/\s+/g, " ").trim(), saw: shown(text) };
    },
  };
}

/**
 * Passes when `selector`'s text contains `expected` (fixed, or from mem).
 * @example Trait.contains("main", (mem) => mem.get(User.email))
 */
export function containsText(selector: string, expected: Expected<string>): Trait {
  return {
    name: `contains(${selector}, ${typeof expected === "string" ? JSON.stringify(expected) : "from mem"})`,
    selector,
    wants: typeof expected === "string" ? `${JSON.stringify(expected)} inside ${selector}` : `the mem value inside ${selector}`,
    async check(page, mem) {
      const text = await textAt(page, selector);
      return { ok: text !== undefined && text.includes(expectedValue(expected, mem)), saw: shown(text === undefined ? text : text.slice(0, 160)) };
    },
  };
}

/** Passes when `selector`'s text matches `pattern`. @example Trait.matches("[data-testid=code]", /^MCH-\d{4}$/) */
export function matchesText(selector: string, pattern: RegExp): Trait {
  return {
    name: `matches(${selector}, ${pattern})`,
    selector,
    wants: `text matching ${pattern} in ${selector}`,
    async check(page) {
      const text = await textAt(page, selector);
      return { ok: text !== undefined && pattern.test(text), saw: shown(text === undefined ? text : text.slice(0, 160)) };
    },
  };
}

/** Passes when a form field holds `expected` (fixed, or from mem). @example Trait.value("#name", "Mixer") */
export function valueEquals(selector: string, expected: Expected<string>): Trait {
  return {
    name: `value(${selector}, ${typeof expected === "string" ? JSON.stringify(expected) : "from mem"})`,
    selector,
    wants: typeof expected === "string" ? `${JSON.stringify(expected)} in the field ${selector}` : `the mem value in the field ${selector}`,
    async check(page, mem) {
      const loc = page.locator(selector).first();
      if ((await loc.count()) === 0) return { ok: false, saw: "no such field" };
      const value = await loc.inputValue();
      return { ok: value === expectedValue(expected, mem), saw: JSON.stringify(value) };
    },
  };
}

/** Passes when `selector`'s attribute `name` is exactly `value`. @example Trait.attribute("#code", "readonly", "") */
export function attributeEquals(selector: string, name: string, value: string): Trait {
  return {
    name: `attribute(${selector}, ${name}, ${JSON.stringify(value)})`,
    selector,
    wants: `${name}=${JSON.stringify(value)} on ${selector}`,
    async check(page) {
      const loc = page.locator(selector).first();
      if ((await loc.count()) === 0) return { ok: false, saw: "nothing matched" };
      const actual = await loc.getAttribute(name);
      return { ok: actual === value, saw: actual === null ? `no ${name}` : JSON.stringify(actual) };
    },
  };
}

/** Passes when nothing matches `selector`: the control is not offered at all. @example Trait.absent("[data-testid=archive]") */
export function absent(selector: string): Trait {
  return {
    name: `absent(${selector})`,
    wants: `no ${selector} on the page`,
    async check(page) {
      const n = await page.locator(selector).count();
      return { ok: n === 0, saw: `${n} of them` };
    },
  };
}

/**
 * Passes when what the page shows for `key` (its Read Block's value) passes `test`: a check in the page's own terms
 * instead of selectors. Retried like every Trait until the page settles; fails when no Read Block reads the key.
 * @example Trait.read(Catalog.items, (items) => items.length === 6, "6 products")
 */
export function readEquals<T>(key: ReadKey<T>, test: (value: T) => boolean, wants?: string): Trait {
  return {
    name: `read(${key.path})`,
    wants: wants ?? `${key.path} to pass its check`,
    async check(page, mem) {
      const value = await readKeyNow(page, mem, key);
      if (value === undefined) return { ok: false, saw: `no value for ${key.path} (is there a Read Block for it, and does the page show it?)` };
      const saw = JSON.stringify(value);
      return { ok: test(value), saw: saw.length > 120 ? saw.slice(0, 117) + "..." : saw };
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
    selector,
    async check(page) {
      await page.locator(selector).first().waitFor({ state: "visible" });
      return true;
    },
  };
}

/**
 * Passes when at least one element matching `selector` is currently disabled -
 * a submit button greyed out until required fields are filled, a "Save" not
 * yet re-enabled after a pending edit. A real, nameable feature *state*, not
 * just static content or an action's result. Uses `.first()` for the same
 * reason `visible` does. A point-in-time read via Playwright's own
 * `isDisabled()` - no wait built in, so pair it with `Trait.visible` (or rely
 * on `verify`'s own natural timing right after `resolve`) if the element
 * itself might not be on the page yet.
 * @example Trait.disabled(CheckoutSel.submitButton)
 */
export function disabled(selector: string): Trait {
  return {
    name: `disabled(${selector})`,
    selector,
    wants: `${selector} disabled`,
    async check(page) {
      const loc = page.locator(selector).first();
      if ((await loc.count()) === 0) return { ok: false, saw: "nothing matched" };
      const off = await loc.isDisabled();
      return { ok: off, saw: off ? "disabled" : "enabled" };
    },
  };
}

/** The complement of {@link disabled} - passes once `selector` is enabled. */
export function enabled(selector: string): Trait {
  return {
    name: `enabled(${selector})`,
    selector,
    wants: `${selector} enabled`,
    async check(page) {
      const loc = page.locator(selector).first();
      if ((await loc.count()) === 0) return { ok: false, saw: "nothing matched" };
      const on = await loc.isEnabled();
      return { ok: on, saw: on ? "enabled" : "disabled" };
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
  contains: containsText,
  matches: matchesText,
  value: valueEquals,
  attribute: attributeEquals,
  absent,
  read: readEquals,
  visible,
  disabled,
  enabled,
  frameVisible,
  frameText: frameTextEquals,
  frameContains: frameContainsText,
};
