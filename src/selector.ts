/**
 * Thin selector helpers - the obvious, discoverable shape for the plain-CSS-first rule
 * (`waygraph-convention.skill.md` #3, `practices-check.ts`'s `overcomplex-selector` warning).
 * Every `selector: string` in the engine (Trait factories, Block `click`/`url`, `.sel.ts` exports)
 * already accepts a plain string - these don't add a new selector TYPE, they add three obvious
 * *functions* to reach for instead of hand-writing a regex/XPath/text-match locator from scratch.
 *
 * `css()` also validates: it throws immediately (not just a lint warning later) if you hand it a
 * regex-looking or XPath string, so the mistake this file exists to steer away from fails loud at
 * the call site instead of quietly working via a needlessly complex selector.
 *
 * A full generated registry of a project's own `*Sel` selectors (Adonis/Prisma-style - typed
 * autocomplete over selectors that already exist, not just these three shapes) is real, larger,
 * future work - backlogged until waygraph's own bigger step (a Dagster/Airflow-style run UI), not
 * part of this pass.
 */

const LOOKS_LIKE_REGEX_TEXT_MATCH = /:text-matches\(|:has-text\(\s*\//;
const LOOKS_LIKE_XPATH = /^\s*(?:xpath=)?\/\//;

/**
 * A plain CSS selector - id, class, tag, attribute, or any combination Playwright's own CSS engine
 * accepts. Throws if `raw` looks like a regex text-match pseudo-class or an XPath instead of CSS -
 * use {@link byText} for a genuine text match, or a raw string (still perfectly valid) when the DOM
 * truly has no stable selector and a regex/XPath is the only option.
 * @example css("#login-button")
 * @example css(".inventory_item .btn_primary")
 */
export function css(raw: string): string {
  if (LOOKS_LIKE_XPATH.test(raw)) {
    throw new Error(
      `css("${raw}"): looks like an XPath, not a plain CSS selector - use the raw string directly ` +
        "if the DOM genuinely has no stable id/class/attribute (css() is for the common case only).",
    );
  }
  if (LOOKS_LIKE_REGEX_TEXT_MATCH.test(raw)) {
    throw new Error(
      `css("${raw}"): looks like a regex text-match pseudo-class - use byText() for a plain text ` +
        "match, or the raw string directly if you genuinely need a regex.",
    );
  }
  return raw;
}

/**
 * A text-match selector, scoped to `within` (a plain CSS selector) when given. Exact match by
 * default - pass `{ contains: true }` for a substring match (Playwright's own `:has-text()`).
 * Prefer this over hand-writing `:has-text(/regex/)` when a plain string is all you need.
 * @example byText("Login")                         // any element with exactly this text
 * @example byText("Submit", { within: "form" })     // scoped to a plain CSS selector
 * @example byText("out of stock", { contains: true }) // substring match
 */
export function byText(text: string, opts?: { within?: string; contains?: boolean }): string {
  const escaped = text.replace(/"/g, '\\"');
  const clause = opts?.contains ? `:has-text("${escaped}")` : `:text-is("${escaped}")`;
  return opts?.within ? `${css(opts.within)} ${clause}` : `*${clause}`;
}

/**
 * An ARIA role selector (Playwright's own `role=` engine) - the accessible-name-first way to
 * target a control, ahead of a brittle DOM-structure guess. `name` matches the element's
 * accessible name exactly (whitespace-normalized), same as Playwright's own role engine default.
 * @example byRole("button", { name: "Login" })
 * @example byRole("checkbox", { name: "Remember me", checked: true })
 */
export function byRole(
  role: string,
  opts?: { name?: string; checked?: boolean; disabled?: boolean; pressed?: boolean },
): string {
  const attrs: string[] = [];
  if (opts?.name !== undefined) attrs.push(`name="${opts.name.replace(/"/g, '\\"')}"`);
  if (opts?.checked !== undefined) attrs.push(`checked=${opts.checked}`);
  if (opts?.disabled !== undefined) attrs.push(`disabled=${opts.disabled}`);
  if (opts?.pressed !== undefined) attrs.push(`pressed=${opts.pressed}`);
  return attrs.length ? `role=${role}[${attrs.join("][")}]` : `role=${role}`;
}
