/**
 * `waygraph check` / `waygraph typecheck` practice warnings — style/typing issues
 * that compile but erode the typed graph. Warnings only (never fail exit code)
 * unless paired with `tsc` errors in `waygraph typecheck`.
 */
import { readdirSync } from "node:fs";
import { dirname, relative } from "node:path";
import { Node, SyntaxKind } from "ts-morph";
import type { CallExpression, SourceFile } from "ts-morph";
import { parseSource } from "../manifest/source.js";
import { toPosix } from "../manifest/scan.js";
import { builtInFindings, type BuiltInKind } from "./built-in-check.js";
import { expectFindings, type ExpectKind } from "./expect-check.js";

export type PracticeKind =
  | "multi-input"
  | "combined-action"
  | "empty-verify"
  | "overcomplex-selector"
  | "inline-selector-should-use-sel-file"
  | "hand-written-ui"
  | BuiltInKind
  | ExpectKind;

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

/** What a Block or flow file does, read from its syntax tree: comments and strings never count as code. */
interface FileFacts {
  defines: (name: string) => CallExpression[];
  /** How many calls to a method by this name (`.fill(…)`, `.click(…)`). */
  callsTo: (method: string) => number;
  /** Every string literal's value. */
  strings: string[];
  /** First arguments of `.locator(…)` calls that are string literals. */
  locatorStrings: string[];
  /** String literals assigned to these property names (`click: "#x"`). */
  propertyStrings: (...names: string[]) => string[];
  identifiers: string[];
  /** Calls and assignments that build or restyle page DOM. */
  domBuilt: boolean;
}

const literalValue = (node: Node | undefined): string | undefined =>
  node && (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) ? node.getLiteralValue() : undefined;

function factsOf(sf: SourceFile): FileFacts {
  const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression);
  const callee = (call: CallExpression): string => {
    const e = call.getExpression();
    return Node.isPropertyAccessExpression(e) ? e.getName() : e.getText();
  };
  const assigned = sf
    .getDescendantsOfKind(SyntaxKind.BinaryExpression)
    .filter((b) => b.getOperatorToken().getKind() === SyntaxKind.EqualsToken)
    .map((b) => b.getLeft());
  const domBuilt =
    calls.some((c) => c.getExpression().getText() === "document.createElement" || ["insertAdjacentHTML", "addStyleTag"].includes(callee(c))) ||
    assigned.some(
      (left) =>
        Node.isPropertyAccessExpression(left) &&
        (left.getName() === "innerHTML" || (Node.isPropertyAccessExpression(left.getExpression()) && left.getExpression().getText().endsWith(".style"))),
    );
  const props = sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment);
  return {
    defines: (name) => calls.filter((c) => c.getExpression().getText() === name),
    callsTo: (method) => calls.filter((c) => Node.isPropertyAccessExpression(c.getExpression()) && callee(c) === method).length,
    strings: [...sf.getDescendantsOfKind(SyntaxKind.StringLiteral), ...sf.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)].map((n) => n.getLiteralValue()),
    locatorStrings: calls.filter((c) => callee(c) === "locator").flatMap((c) => literalValue(c.getArguments()[0]) ?? []),
    propertyStrings: (...names) => props.filter((p) => names.includes(p.getName())).flatMap((p) => literalValue(p.getInitializer()) ?? []),
    identifiers: sf.getDescendantsOfKind(SyntaxKind.Identifier).map((i) => i.getText()),
    domBuilt,
  };
}

/** A define call's `verify`: absent, a literal `[]`, or something. */
function verifyOf(call: CallExpression): "none" | "empty" | "some" {
  const verify = call.getDescendantsOfKind(SyntaxKind.PropertyAssignment).find((p) => p.getName() === "verify");
  if (!verify) return "none";
  const init = verify.getInitializer();
  return Node.isArrayLiteralExpression(init) && init.getElements().length === 0 ? "empty" : "some";
}

/** A Method's route as written (`from: LoginPage, to: LoggedIn`) - a transition when they differ. */
function routeOf(call: CallExpression): { from: string; to: string } | undefined {
  const options = call.getArguments()[0];
  if (!Node.isObjectLiteralExpression(options)) return undefined;
  const text = (name: string) => {
    const prop = options.getProperty(name);
    return Node.isPropertyAssignment(prop) ? prop.getInitializerOrThrow().getText() : undefined;
  };
  const to = text("to");
  return to ? { from: text("from") ?? "*", to } : undefined;
}

const SCAN_GLOB = /\.(block|flow)\.ts$/;

/**
 * A selector reaching for a regex-based Playwright text pseudo-class (`:has-text(/…/)`, `:text-matches(…)`) or an XPath -
 * real, recurring pattern: an LLM asked to target a simple element writes a regex/XPath from scratch. Playwright accepts
 * all of it, so nothing else catches it. (These read selector strings, not code.)
 */
function overcomplexSelector(facts: FileFacts): string | undefined {
  if (facts.strings.some((v) => v.includes(":text-matches("))) return ":text-matches(...)";
  if (facts.strings.some((v) => /:has-text\(\s*\//.test(v))) return ":has-text(/regex/)";
  if (facts.locatorStrings.some((v) => /^(?:xpath=)?\/\//.test(v))) return "an XPath locator";
  return undefined;
}

/** A single-token selector (id or class) written inline, in `.locator("…")`, `click: "…"` or `url: "…"`. */
const SIMPLE_SELECTOR = /^[#.][\w-]+$/;

/**
 * Hand-written UI in a test project - real, recurring pattern: an LLM wanting a caption, a highlight or a banner builds
 * its own DOM in the page or restyles / reaches into waygraph's overlay, instead of using `ctx.ui`. It changes the page
 * under test and breaks whenever the overlay changes.
 */
function handWrittenUi(facts: FileFacts): string | undefined {
  if (facts.identifiers.some((i) => i.startsWith("__wg")) || facts.strings.some((v) => /#wg-|\.wg-|wg-root/.test(v))) {
    return "reaches into waygraph's overlay (#wg-*, .wg-*, window.__wg*)";
  }
  if (facts.domBuilt) return "builds or restyles page DOM (createElement / innerHTML / addStyleTag / .style)";
  return undefined;
}

/** Shared narration (`src/stubs/*.ts`) is checked for hand-written UI too, next to Block and flow files. */
const STUB_FILE = /[\\/]stubs[\\/][^\\/]+\.ts$/;

/** Whole-file opt-out: `// waygraph-ignore-practices` */
const IGNORE_ALL = /waygraph-ignore-practices/;

/** Per-kind opt-out: `// waygraph-ignore: multi-input, combined-action` */
const IGNORE_KINDS = /waygraph-ignore:\s*([^\n*]+)/;

function ignoredKindsForFile(src: string): Set<PracticeKind> | "all" {
  if (IGNORE_ALL.test(src)) return "all";
  const m = IGNORE_KINDS.exec(src);
  if (!m?.[1]) return new Set();
  return new Set(m[1].split(/[,;\s]+/).filter(Boolean) as PracticeKind[]);
}

function isIgnored(kind: PracticeKind, ignore: Set<PracticeKind> | "all"): boolean {
  return ignore === "all" || ignore.has(kind);
}

export function collectPracticeWarnings(
  projectDir: string,
  walkDir: (dir: string, re: RegExp) => string[],
  opts?: PracticeCheckOptions,
): PracticeWarning[] {
  if (opts?.disabled) return [];
  const warnings: PracticeWarning[] = [];
  for (const file of walkDir(projectDir, SCAN_GLOB)) {
    const rel = toPosix(relative(projectDir, file));
    const sf = parseSource(file);
    const ignore = ignoredKindsForFile(sf.getFullText());
    const facts = factsOf(sf);

    const methods = facts.defines("defineMethodBlock");
    if (methods.length > 0) {
      const fills = facts.callsTo("fill");
      const clicks = facts.callsTo("click");
      if (!isIgnored("multi-input", ignore) && fills >= 2) {
        warnings.push({
          kind: "multi-input",
          file: rel,
          detail: `Method act() has ${fills} .fill() calls — one distinct input per Block (split into separate defineMethodBlock files, e.g. fill-username + fill-password + submit-login)`,
        });
      }
      if (!isIgnored("combined-action", ignore) && fills >= 1 && clicks >= 1) {
        warnings.push({
          kind: "combined-action",
          file: rel,
          detail:
            "Method act() mixes .fill() and .click() — fill and submit must be separate Blocks (see examples/saucedemo login split)",
        });
      }
      for (const call of methods) {
        const route = routeOf(call);
        if (!route || route.from === route.to || isIgnored("empty-verify", ignore) || verifyOf(call) === "some") continue;
        warnings.push({
          kind: "empty-verify",
          file: rel,
          detail:
            `transition Block (${route.from} → ${route.to}) has no verify checks — resolve() moving ` +
            "to a new Checkpoint is never confirmed by anything; add a Trait (verify says the step arrived), " +
            "or opt out explicitly with // waygraph-ignore: empty-verify if that's intentional",
        });
      }
    }

    const via = isIgnored("overcomplex-selector", ignore) ? undefined : overcomplexSelector(facts);
    if (via) {
      warnings.push({
        kind: "overcomplex-selector",
        file: rel,
        detail:
          `uses ${via} — reach for a plain CSS selector (id/class/data-attribute, via a _sel.ts/` +
          "*.sel.ts export) instead of a regex/XPath match unless the DOM genuinely has no stable selector",
      });
    }

    const inline = [...facts.locatorStrings, ...facts.propertyStrings("click", "url")].some((v) => SIMPLE_SELECTOR.test(v));
    if (!isIgnored("inline-selector-should-use-sel-file", ignore) && inline) {
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

    const ui = isIgnored("hand-written-ui", ignore) ? undefined : handWrittenUi(facts);
    if (ui) warnings.push(handWrittenUiWarning(rel, ui));

    if (!isIgnored("empty-verify", ignore) && facts.defines("defineExpectBlock").some((call) => verifyOf(call) === "empty")) {
      warnings.push({
        kind: "empty-verify",
        file: rel,
        detail:
          "defineExpectBlock's verify array is empty — an Expect Block whose only job is checking will pass " +
          "trivially forever; fill in real Traits or remove the stub",
      });
    }
  }
  for (const file of walkDir(projectDir, /\.ts$/).filter((f) => STUB_FILE.test(f) && !SCAN_GLOB.test(f))) {
    const sf = parseSource(file);
    const ui = isIgnored("hand-written-ui", ignoredKindsForFile(sf.getFullText())) ? undefined : handWrittenUi(factsOf(sf));
    if (ui) warnings.push(handWrittenUiWarning(toPosix(relative(projectDir, file)), ui));
  }
  // Code written for something waygraph already does, in any .ts file: helpers and specs too.
  for (const file of walkDir(projectDir, /\.ts$/).filter((f) => !f.endsWith(".d.ts"))) {
    const sf = parseSource(file);
    const ignore = ignoredKindsForFile(sf.getFullText());
    for (const found of [...builtInFindings(file, sf), ...expectFindings(sf)]) {
      if (!isIgnored(found.kind, ignore)) warnings.push({ ...found, file: toPosix(relative(projectDir, file)) });
    }
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
    case "cast-to-outcome":
      return "a cast picks a Block's outcome — use { lands }";
    case "ff-run":
      return "{ ff: true } on step after step — use .ffStart()/.ffEnd()";
    case "hand-rolled-retry":
      return "a retry loop by hand — Traits already retry";
    case "seeded-spec":
      return "a spec seeding stubs by hand";
    case "builder-helper":
      return "a function over MapBuilder — use steps()";
    case "overlay-workaround":
      return "a workaround for the demo overlay it no longer needs";
    case "start-tag":
      return "the start tag by hand — use Start";
    case "mutating-expectation":
      return "an expectation that acts on the page — expectations only read";
    case "arrival-in-expect":
      return "an arrival check in an Expect Block — it belongs in verify";
    case "outcome-in-verify":
      return "an outcome check in a Method's verify — it belongs in expect";
    case "expect-one-read":
      return "an Expect Block that is one read check — use Key.is()";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
