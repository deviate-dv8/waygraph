// Split out of the former 8,700-line cli.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { readFileSync } from "node:fs";
import { importFresh, isBlockLike, walkDir } from "../manifest/scan.js";

// ---------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------



export function discoverFlows(projectDir: string): string[] {
  return walkDir(projectDir, /\.flow\.ts$/);
}


// ---------------------------------------------------------------------------
// Static analysis for `list`/`nav` (no import, regex only)
// ---------------------------------------------------------------------------

export function extractFlowNames(filePath: string): string[] {
  const src = readFileSync(filePath, "utf-8");
  const names: string[] = [];
  const re = /export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[=:]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    if (name !== undefined) names.push(name);
  }
  return names;
}


/** `LoginBlock` -> `"login"`; `OverviewMetricsBlock` -> `"overview-metrics"`. */
export function blockExportToLabel(exportId: string): string {
  const base = exportId.replace(/Block$/, "");
  return base
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}


/** Every `...Block` identifier a `.flow.ts` file imports, in source order. */
export function parseBlockImports(filePath: string): string[] {
  const src = readFileSync(filePath, "utf-8");
  const names: string[] = [];
  const re = /import\s*\{([^}]*)\}\s*from\s*["'][^"']*\.block(?:\.js)?["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    for (const part of m[1]!.split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0]?.trim();
      if (name) names.push(name);
    }
  }
  return names;
}


/** Every `page.goto("...")` string literal in a file, in source order. */
export function extractGotos(filePath: string): string[] {
  const src = readFileSync(filePath, "utf-8");
  const results: string[] = [];
  const re = /\.goto\(\s*["'`]([^"'`]*)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const url = m[1];
    if (url !== undefined) results.push(url);
  }
  return results;
}


/** Every `Trait.url({ pathname: "..." })` target in a file, in source order. */
export function extractUrlTraits(filePath: string): string[] {
  const src = readFileSync(filePath, "utf-8");
  const results: string[] = [];
  const re = /Trait\.url\(\s*\{[^}]*pathname:\s*["'`]([^"'`]*)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const url = m[1];
    if (url !== undefined) results.push(url);
  }
  return results;
}


// ---------------------------------------------------------------------------
// Dynamic import + validation
// ---------------------------------------------------------------------------



/** Kept as a named alias - `run`/`validate` below were written against this name first. */
export const importFlowFile = importFresh;
export { walkDir, isBlockLike, importFresh as importModule };


export function isFlowLike(val: unknown): val is { run: (...args: unknown[]) => Promise<unknown> } {
  if (val === null || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  return typeof obj.run === "function";
}


// ---------------------------------------------------------------------------
// `check` - secondary/complementary to the ActionPage @deprecated warning
// (src/core/types.ts). That's the primary, always-on signal an editor shows the
// instant a regular Block's act() calls a navigation method; this command
// sweeps a whole project in one shot for contexts with no editor watching
// (CI, an autonomous agent writing Block files without a language server).
// See openspec/specs/nav-block-and-check/spec.md for the full rationale.
// ---------------------------------------------------------------------------

export function discoverBlocks(projectDir: string): string[] {
  return walkDir(projectDir, /\.block\.ts$/);
}




/** Set by `defineNavBlock` (non-enumerable) - see src/core.ts. */
export function isNavBlockMarked(val: Record<string, unknown>): boolean {
  return (val as { __waygraphKind?: string }).__waygraphKind === "nav";
}


export const NAV_METHOD_CALLS = ["page.goto(", "page.reload(", "page.goBack(", "page.goForward("] as const;


/**
 * Matches a selector-taking Trait factory call whose first argument is a
 * literal string/template, not an identifier or property access - the exact
 * shape found repeatedly in hand-written assertion Blocks
 * (`Trait.visible("#some-id")` instead of `Trait.visible(SomeSel.thing)`).
 * `Trait.url(...)` is deliberately excluded - it takes a URLPatternInit, never
 * a DOM selector. Same file-scoped-regex bluntness the nav-escape sweep above
 * already accepts (see openspec/specs/nav-block-and-check/spec.md) - a known
 * blind spot on string concatenation/template-built selectors, not solved
 * here for the same "recipe before promotion" reason that check accepts its
 * own shared-helper blind spot.
 */
export const INLINE_SELECTOR_CALL = /\b(?:Trait\.visible|Trait\.text|textEquals|visible)\(\s*["'`]/;
