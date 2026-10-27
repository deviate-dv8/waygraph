/**
 * `waygraph check` / `waygraph typecheck` practice warnings — style/typing issues
 * that compile but erode the typed graph. Warnings only (never fail exit code)
 * unless paired with `tsc` errors in `waygraph typecheck`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative } from "node:path";
import { Node, SyntaxKind } from "ts-morph";
import { parseSource } from "../manifest/source.js";

export type PracticeKind =
  | "multi-input"
  | "combined-action"
  | "empty-verify"
  | "overcomplex-selector"
  | "inline-selector-should-use-sel-file"
  | "hand-written-ui";

export interface PracticeWarning {
  kind: PracticeKind;
  file: string;
  /** Short hint for humans/agents. */
  detail: string;
}

export interface PracticeCheckOptions {
  /** Skip all practice scanning (CLI `--no-practices`). */
  disabled?: boolean;
}

/** defineAssertBlock, any form - used to scope the empty-verify check below. */
const IS_ASSERT_BLOCK = /\bdefineAssertBlock\s*[<(]/;

/** A Method/Effect's route as written (`from: LoginPage, to: LoggedIn`), from the AST - a transition when they differ. */
function routeAsWritten(file: string): { from: string; to: string } | undefined {
  const sf = parseSource(file);
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (!/^define(Method|Effect)Block$/.test(call.getExpression().getText())) continue;
    const options = call.getArguments()[0];
    if (!Node.isObjectLiteralExpression(options)) continue;
    const text = (name: string) => {
      const prop = options.getProperty(name);
      return Node.isPropertyAssignment(prop) ? prop.getInitializerOrThrow().getText() : undefined;
    };
    const to = text("to");
    if (to) return { from: text("from") ?? "*", to };
  }
  return undefined;
}

/** `verify: []` - a literal empty array, the codegen-stub shape this check exists for. */
const EMPTY_VERIFY_ARRAY = /\bverify\s*:\s*\[\s*\]/;

/** Any `verify:` key at all, empty or not. */
const HAS_VERIFY_KEY = /\bverify\s*:/;

const SCAN_GLOB = /\.(block|flow)\.ts$/;

/**
 * A selector string reaching for a regex-based Playwright text pseudo-class (`:has-text(/…/)`,
 * `:text-matches(…)`) or a plain XPath - real, recurring pattern: an LLM asked to target a simple
 * element (one class, one id, one data-attribute) instead writes a regex/XPath from scratch. Not a
 * type error (Playwright's own selector syntax accepts all of this), so nothing else catches it.
 */
const TEXT_MATCHES_PSEUDO = /:text-matches\(/;
const HAS_TEXT_REGEX_PSEUDO = /:has-text\(\s*\//;
const XPATH_LOCATOR = /\.locator\(\s*["'`](?:xpath=)?\/\//;

/** A selector string literal inline in a Block file (`.locator("…")`, `click: "…"`, `url: "…"`) -
 *  scoped to simple, single-token selectors (id/class/attr/tag) so this doesn't fire on the
 *  legitimate multi-part selectors `.sel.ts` files themselves are made of. */
const INLINE_SIMPLE_SELECTOR = /(?:\.locator|\bclick|\burl)\s*[:(]\s*["'`](#|\.)[\w-]+["'`]/;

/**
 * Hand-written UI in a test project - real, recurring pattern: an LLM wanting a caption, a highlight or a banner builds
 * its own DOM in the page or restyles / reaches into waygraph's overlay, instead of using `ctx.ui`. It changes the page
 * under test and breaks whenever the overlay changes.
 */
const OVERLAY_INTERNALS = /\b__wg[A-Za-z]|["'`][^"'`\n]*(?:#wg-|\.wg-|wg-root)/;
const DOM_BUILD = /\bdocument\.createElement\(|\.innerHTML\s*=|\binsertAdjacentHTML\(|\baddStyleTag\(|\.style\.cssText|\.style\.[a-zA-Z]+\s*=(?!=)/;

/** Shared narration (`src/stubs/*.ts`) is checked for hand-written UI too, next to Block and flow files. */
const STUB_FILE = /[\\/]stubs[\\/][^\\/]+\.ts$/;

const METHOD_OR_EFFECT_FILE = /\.(method|effect)\.block\.ts$/;
const METHOD_OR_EFFECT_DEFINE = /\bdefine(?:Method|Effect)Block\b/;

/** Whole-file opt-out: `// waygraph-ignore-practices` */
const IGNORE_ALL = /waygraph-ignore-practices/;

/** Per-kind opt-out: `// waygraph-ignore: multi-input, combined-action` */
const IGNORE_KINDS = /waygraph-ignore:\s*([^\n*]+)/;

function walkBlockAndFlowFiles(projectDir: string, walkDir: (dir: string, re: RegExp) => string[]): string[] {
  return walkDir(projectDir, SCAN_GLOB);
}

function handWrittenUi(src: string): string | undefined {
  if (OVERLAY_INTERNALS.test(src)) return "reaches into waygraph's overlay (#wg-*, .wg-*, window.__wg*)";
  if (DOM_BUILD.test(src)) return "builds or restyles page DOM (createElement / innerHTML / addStyleTag / .style)";
  return undefined;
}

function ignoredKindsForFile(src: string): Set<PracticeKind> | "all" {
  if (IGNORE_ALL.test(src)) return "all";
  const m = IGNORE_KINDS.exec(src);
  if (!m) return new Set();
  const kinds = new Set<PracticeKind>();
  for (const token of m[1]!.split(/[,;\s]+/)) {
    const t = token.trim() as PracticeKind;
    if (t) kinds.add(t);
  }
  return kinds;
}

function isIgnored(kind: PracticeKind, ignore: Set<PracticeKind> | "all"): boolean {
  return ignore === "all" || ignore.has(kind);
}

function countMatches(src: string, re: RegExp): number {
  re.lastIndex = 0;
  return (src.match(re) ?? []).length;
}

export function collectPracticeWarnings(
  projectDir: string,
  walkDir: (dir: string, re: RegExp) => string[],
  opts?: PracticeCheckOptions,
): PracticeWarning[] {
  if (opts?.disabled) return [];
  const warnings: PracticeWarning[] = [];
  for (const file of walkBlockAndFlowFiles(projectDir, walkDir)) {
    const rel = relative(projectDir, file).replace(/\\/g, "/");
    const src = readFileSync(file, "utf-8");
    const ignore = ignoredKindsForFile(src);

    const isMethodOrEffect = METHOD_OR_EFFECT_FILE.test(rel) || METHOD_OR_EFFECT_DEFINE.test(src);
    if (isMethodOrEffect) {
      const fills = countMatches(src, /\.fill\s*\(/g);
      const clicks = countMatches(src, /\.click\s*\(/g);
      if (!isIgnored("multi-input", ignore) && fills >= 2) {
        warnings.push({
          kind: "multi-input",
          file: rel,
          detail: `Method/Effect act() has ${fills} .fill() calls — one distinct input per Block (split into separate defineMethodBlock files, e.g. fill-username + fill-password + submit-login)`,
        });
      }
      if (!isIgnored("combined-action", ignore) && fills >= 1 && clicks >= 1) {
        warnings.push({
          kind: "combined-action",
          file: rel,
          detail:
            "Method/Effect act() mixes .fill() and .click() — fill and submit must be separate Blocks (see examples/saucedemo login split)",
        });
      }
      const route = routeAsWritten(file);
      const isTransition = !!route && route.from !== route.to;
      if (
        isTransition &&
        !isIgnored("empty-verify", ignore) &&
        (!HAS_VERIFY_KEY.test(src) || EMPTY_VERIFY_ARRAY.test(src))
      ) {
        warnings.push({
          kind: "empty-verify",
          file: rel,
          detail:
            `transition Block (${route!.from} → ${route!.to}) has no verify checks — resolve() moving ` +
            "to a new Checkpoint is never confirmed by anything; add a Trait (or defineAssertBlock right after it), " +
            "or opt out explicitly with // waygraph-ignore: empty-verify if that's intentional",
        });
      }
    }

    if (
      !isIgnored("overcomplex-selector", ignore) &&
      (TEXT_MATCHES_PSEUDO.test(src) || HAS_TEXT_REGEX_PSEUDO.test(src) || XPATH_LOCATOR.test(src))
    ) {
      const via = TEXT_MATCHES_PSEUDO.test(src)
        ? ":text-matches(...)"
        : HAS_TEXT_REGEX_PSEUDO.test(src)
          ? ":has-text(/regex/)"
          : "an XPath locator";
      warnings.push({
        kind: "overcomplex-selector",
        file: rel,
        detail:
          `uses ${via} — reach for a plain CSS selector (id/class/data-attribute, via a _sel.ts/` +
          "*.sel.ts export) instead of a regex/XPath match unless the DOM genuinely has no stable selector",
      });
    }

    if (!isIgnored("inline-selector-should-use-sel-file", ignore) && INLINE_SIMPLE_SELECTOR.test(src)) {
      // Two real, coexisting conventions: the Map layout's own `_sel.ts` (one per page folder, next
      // to `_nav`/`_page`/`_methods`) and the freeform layout's per-concern `<name>.sel.ts`.
      const siblingSelFile = readdirSync(dirname(file)).some((f) => f === "_sel.ts" || f.endsWith(".sel.ts"));
      if (siblingSelFile) {
        warnings.push({
          kind: "inline-selector-should-use-sel-file",
          file: rel,
          detail:
            "a selector string is inlined here, but this directory already has a _sel.ts / *.sel.ts file — " +
            "add/reuse the selector there instead of a new one-off literal",
        });
      }
    }

    const ui = isIgnored("hand-written-ui", ignore) ? undefined : handWrittenUi(src);
    if (ui) warnings.push(handWrittenUiWarning(rel, ui));

    if (!isIgnored("empty-verify", ignore) && IS_ASSERT_BLOCK.test(src) && EMPTY_VERIFY_ARRAY.test(src)) {
      warnings.push({
        kind: "empty-verify",
        file: rel,
        detail:
          "defineAssertBlock's verify array is empty — an assert Block whose only job is checking will pass " +
          "trivially forever; fill in real Traits or remove the stub",
      });
    }
  }
  for (const file of walkDir(projectDir, /\.ts$/).filter((f) => STUB_FILE.test(f) && !SCAN_GLOB.test(f))) {
    const src = readFileSync(file, "utf-8");
    const ui = isIgnored("hand-written-ui", ignoredKindsForFile(src)) ? undefined : handWrittenUi(src);
    if (ui) warnings.push(handWrittenUiWarning(relative(projectDir, file).replace(/\\/g, "/"), ui));
  }
  return warnings;
}

function handWrittenUiWarning(file: string, what: string): PracticeWarning {
  return {
    kind: "hand-written-ui",
    file,
    detail:
      `${what} - narration goes through ctx.ui (ring, caption, title, todos, slides, device, zoom, network tab), ` +
      "and a test never changes the page it tests. Missing something in ctx.ui? Ask for it in waygraph instead of " +
      "overriding; opt out with // waygraph-ignore: hand-written-ui",
  };
}

export function practiceKindLabel(kind: PracticeKind): string {
  switch (kind) {
    case "multi-input":
      return "multiple inputs in one Block";
    case "combined-action":
      return "fill and click in one Block";
    case "empty-verify":
      return "empty verify — transition unconfirmed";
    case "overcomplex-selector":
      return "regex/XPath selector where a plain one would do";
    case "inline-selector-should-use-sel-file":
      return "inline selector — a _sel.ts/*.sel.ts file already exists here";
    case "hand-written-ui":
      return "hand-written UI — use ctx.ui, don't build or override the overlay";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
