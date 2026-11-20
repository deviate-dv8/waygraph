/**
 * Typed selector builders, the strings Playwright's own `getBy…` methods make, typed from Playwright's types. A selector
 * stays a plain string (it goes to `page.locator(…)`, a Trait, `click`, a ring), so a `_sel.ts` can mix plain strings and
 * these: plain strings are always fine; these make a wrong role, option or argument a compile error instead of a run-time
 * "element not found". Each builds the same selector the matching `page.getBy…` would, with the same `exact` meaning.
 *
 * @example
 * export const LoginSel = {
 *   username: sel.testId("username"),
 *   submit: sel.role("button", { name: "Login" }),
 *   error: sel.css("[data-test=error]"),
 *   field: (name: string) => sel.label(name),
 * };
 */
import type { Page } from "@playwright/test";

type RoleArgs = Parameters<Page["getByRole"]>;
type TextOptions = NonNullable<Parameters<Page["getByText"]>[1]>;

const LOOKS_LIKE_REGEX_TEXT_MATCH = /:text-matches\(|:has-text\(\s*\//;
const LOOKS_LIKE_XPATH = /^\s*(?:xpath=)?\/\//;

/** A string or a regex as Playwright writes it in a selector: `"text"i` / `"text"s` (exact), or `/source/flags`. */
function matcher(value: string | RegExp, exact: boolean | undefined): string {
  if (value instanceof RegExp) return `/${value.source}/${value.flags}`;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"${exact ? "s" : "i"}`;
}

const text = (engine: string) => (value: string | RegExp, options?: TextOptions): string => `internal:${engine}=${matcher(value, options?.exact)}`;
const attribute = (name: string) => (value: string | RegExp, options?: TextOptions): string => `internal:attr=[${name}=${matcher(value, options?.exact)}]`;

/** Whether a selector is one only Playwright reads (a `sel.role(...)`, `internal:`, `>>`, `text=`): `document.querySelector` can't. */
export const isEngineSelector = (selector: string): boolean => /^internal:|>>|^(role|text|xpath|id|data-testid|data-test-id|data-test)=/.test(selector);

export const sel = {
  /**
   * A plain CSS selector: an id, a class, a tag, an attribute, or any mix of them. Throws at once on an XPath or a regex
   * text match, the things plain CSS is meant to steer away from (a raw string is still fine when the DOM has nothing stable).
   * @example sel.css("#login-button")
   */
  css(raw: string): string {
    if (LOOKS_LIKE_XPATH.test(raw)) {
      throw new Error(`sel.css("${raw}"): looks like an XPath, not CSS - use the raw string directly if the DOM has no stable id, class or attribute`);
    }
    if (LOOKS_LIKE_REGEX_TEXT_MATCH.test(raw)) {
      throw new Error(`sel.css("${raw}"): looks like a regex text match - use sel.text(/regex/), or the raw string directly`);
    }
    return raw;
  },

  /**
   * By ARIA role and accessible name, with `getByRole`'s own options (`name`, `exact`, `checked`, `disabled`, `selected`,
   * `expanded`, `pressed`, `level`, `includeHidden`): the role is the union of roles, so a typo is a compile error.
   * @example sel.role("button", { name: "Login" }) · sel.role("checkbox", { name: "Remember me", checked: true })
   */
  role(role: RoleArgs[0], options: RoleArgs[1] = {}): string {
    const props: string[] = [];
    const { name, exact, checked, disabled, selected, expanded, includeHidden, level, pressed } = options;
    if (checked !== undefined) props.push(`checked=${checked}`);
    if (disabled !== undefined) props.push(`disabled=${disabled}`);
    if (selected !== undefined) props.push(`selected=${selected}`);
    if (expanded !== undefined) props.push(`expanded=${expanded}`);
    if (includeHidden !== undefined) props.push(`include-hidden=${includeHidden}`);
    if (level !== undefined) props.push(`level=${level}`);
    if (name !== undefined) props.push(`name=${matcher(name, exact)}`);
    if (pressed !== undefined) props.push(`pressed=${pressed}`);
    return `internal:role=${role}${props.map((p) => `[${p}]`).join("")}`;
  },

  /**
   * By test id. The attribute is `data-testid`; pass `{ attribute }` for the one the app uses (`data-test`, `data-qa`).
   * @example sel.testId("username") · sel.testId("username", { attribute: "data-test" })
   */
  testId(id: string | RegExp, options: { attribute?: string } = {}): string {
    const attr = options.attribute ?? "data-testid";
    return `internal:testid=[${attr}=${id instanceof RegExp ? `/${id.source}/${id.flags}` : `"${id.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"s`}]`;
  },

  /** By visible text (`getByText`): a substring, ignoring case, unless `{ exact: true }`. @example sel.text("Sign in") */
  text: text("text"),
  /** By the text of the label a form control has (`getByLabel`). @example sel.label("Email") */
  label: text("label"),
  /** By a field's placeholder (`getByPlaceholder`). @example sel.placeholder("Search") */
  placeholder: attribute("placeholder"),
  /** By an image's alternative text (`getByAltText`). @example sel.altText("Company logo") */
  altText: attribute("alt"),
  /** By the `title` attribute (`getByTitle`). @example sel.title("Close") */
  title: attribute("title"),

  /**
   * One selector inside another: `child` among the descendants of `parent`.
   * @example sel.within(sel.css("form#login"), sel.role("button", { name: "Login" }))
   */
  within(parent: string, child: string): string {
    return `${parent} >> ${child}`;
  },
};
