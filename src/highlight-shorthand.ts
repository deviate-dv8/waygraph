/**
 * Compact alternative to full-JSON `browser highlight` payloads, for the
 * common case (a couple of rings, each just selector + label + maybe tone).
 * Full JSON stays fully supported for anything needing size/weight/zoom/
 * focus/detail/tag/todos - this only ever covers a subset.
 *
 * Grammar: `<selector>|<label>[|<tone>]` rings joined by `;`.
 *   "#submit|Login button|warning; .error|Error banner|danger"
 *
 * `;` and `|` were picked because neither is valid inside a CSS/Playwright
 * selector or an ordinary label - unlike `,`/`:`, which real selectors use
 * constantly (`:nth-child(2)`, `:not(.x)`, `[href*="mailto:"]`, compound
 * `a, b` lists). A selector/label containing a literal `;` or `|` needs the
 * full-JSON form instead - documented, not silently mishandled.
 */
import type { PilotFixtureRing, PilotHighlightFixtures } from "./pilot-overlay.js";

export type ParsedHighlightShorthand =
  | { type: "ok"; fixtures: PilotHighlightFixtures }
  | { type: "error"; reason: string };

export function parseHighlightShorthand(raw: string): ParsedHighlightShorthand {
  const tokens = raw
    .split(";")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return { type: "error", reason: "empty highlight shorthand - give at least one <selector>|<label> ring" };
  }

  const rings: PilotFixtureRing[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const parts = token.split("|").map((p) => p.trim());
    if (parts.length < 2 || parts.length > 3) {
      return {
        type: "error",
        reason:
          `ring ${i + 1} ("${token}") must be <selector>|<label> or <selector>|<label>|<tone> ` +
          `- got ${parts.length} part(s) separated by "|"`,
      };
    }
    const [selector, label, tone] = parts;
    if (!selector) {
      return { type: "error", reason: `ring ${i + 1} ("${token}") has an empty selector` };
    }
    if (!label) {
      return { type: "error", reason: `ring ${i + 1} ("${token}") has an empty label` };
    }
    rings.push(tone ? { selector, label, tone } : { selector, label });
  }

  return { type: "ok", fixtures: { rings } };
}
