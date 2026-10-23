// `waygraph validate` and `waygraph check`: does every Flow file load, and do Blocks keep navigation and selectors where
// they belong. Warnings only.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { importFresh, isBlockLike, walkDir } from "../manifest/scan.js";
import { collectPracticeWarnings } from "./practices-check.js";
import type { PracticeWarning } from "./practices-check.js";
import { mapGroupImportProblems, mapGroups } from "../manifest/maps.js";
import type { MapImportProblem } from "../manifest/maps.js";

/** Anything runnable counts for `validate` (looser than the manifest, which also wants `.blocks()`). */
function isFlowLike(val: unknown): boolean {
  return val !== null && typeof val === "object" && typeof (val as { run?: unknown }).run === "function";
}

/** Set by `defineNavBlock` (non-enumerable) - see engine/block/kinds/nav.ts. */
function isNavBlockMarked(val: Record<string, unknown>): boolean {
  return (val as { __waygraphKind?: string }).__waygraphKind === "nav";
}


const NAV_METHOD_CALLS = ["page.goto(", "page.reload(", "page.goBack(", "page.goForward("] as const;


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
const INLINE_SELECTOR_CALL = /\b(?:Trait\.visible|Trait\.text|textEquals|visible)\(\s*["'`]/;


export interface FlowInfo {
  file: string;
  name: string;
  valid: boolean;
  error?: string;
}


export async function validateFlows(projectDir: string): Promise<FlowInfo[]> {
  const files = walkDir(projectDir, /\.flow\.ts$/);
  const results: FlowInfo[] = [];
  for (const file of files) {
    try {
      const mod = await importFresh(file);
      for (const [exportName, exported] of Object.entries(mod)) {
        if (isFlowLike(exported)) {
          results.push({ file, name: exportName, valid: true });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ file, name: basename(file, ".ts"), valid: false, error: msg });
    }
  }
  return results;
}


export interface CheckWarning {
  file: string;
  blockName: string;
  exportName: string;
}


export interface SelWarning {
  file: string;
  blockName: string;
  exportName: string;
}


/**
 * Walks every `*.block.ts` file under `projectDir`, imports each to find its
 * exported Blocks, and for any Block NOT built via `defineNavBlock`, scans
 * that file's own source text for a navigation call. Warning only - never
 * throws, never changes the caller's exit code on its own account (a Block
 * file that fails to import for unrelated reasons is silently skipped here;
 * `validate` is the command that reports import failures).
 */
export async function checkProject(
  projectDir: string,
  opts?: { noPractices?: boolean },
): Promise<{
  navWarnings: CheckWarning[];
  selWarnings: SelWarning[];
  practiceWarnings: PracticeWarning[];
}> {
  const files = walkDir(projectDir, /\.block\.ts$/);
  const navWarnings: CheckWarning[] = [];
  const selWarnings: SelWarning[] = [];
  for (const file of files) {
    let mod: Record<string, unknown>;
    try {
      mod = await importFresh(file);
    } catch {
      continue;
    }
    let src: string | undefined;
    for (const [exportName, exported] of Object.entries(mod)) {
      if (!isBlockLike(exported)) continue;
      src ??= readFileSync(file, "utf-8");
      // Nav-escape: NavBlocks are exempt (their generated act() is the one
      // legitimate goto/click call site).
      if (
        !isNavBlockMarked(exported as unknown as Record<string, unknown>) &&
        NAV_METHOD_CALLS.some((needle) => src!.includes(needle))
      ) {
        navWarnings.push({ file, blockName: exported.name, exportName });
      }
      // Inline selector: applies to every Block kind, including NavBlocks -
      // a Nav's own `verify` array is just as likely to inline a selector.
      if (INLINE_SELECTOR_CALL.test(src)) {
        selWarnings.push({ file, blockName: exported.name, exportName });
      }
    }
  }
  const practiceWarnings = collectPracticeWarnings(projectDir, walkDir, {
    disabled: opts?.noPractices === true,
  });
  return { navWarnings, selWarnings, practiceWarnings };
}


/** Imports in each packable map group that reach outside it (see `manifest/maps.ts`). */
export function checkMapGroups(projectDir: string): (MapImportProblem & { group: string })[] {
  return mapGroups(projectDir).flatMap((g) => mapGroupImportProblems(g).map((p) => ({ ...p, group: g.group })));
}
