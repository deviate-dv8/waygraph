// `waygraph validate` and `waygraph check`: does every Flow file load, and do Blocks keep navigation and selectors where
// they belong. Warnings only.
import { basename, relative } from "node:path";
import { importFresh, isBlockLike, walkDir } from "../manifest/scan.js";
import { calls, parseSource } from "../manifest/source.js";
import { collectPracticeWarnings } from "./practices-check.js";
import type { PracticeWarning } from "./practices-check.js";
import { mapGroups } from "../manifest/maps.js";
import { reportImportError } from "../manifest/project.js";
import { mapGroupImportProblems } from "../manifest/map-imports.js";
import type { MapImportProblem } from "../manifest/map-imports.js";

/** Anything runnable counts for `validate` (looser than the manifest, which also wants `.blocks()`). */
function isFlowLike(val: unknown): boolean {
  return val !== null && typeof val === "object" && typeof (val as { run?: unknown }).run === "function";
}

/** Set by `defineNavBlock` (non-enumerable) - see engine/block/kinds/nav.ts. */
function isNavBlockMarked(val: object): boolean {
  return (val as { __waygraphKind?: string }).__waygraphKind === "nav";
}


const NAV_METHODS = new Set(["page.goto", "page.reload", "page.goBack", "page.goForward"]);


/**
 * Selector-taking Trait factories. Called with a string literal (`Trait.visible("#some-id")`) instead of a Sel
 * (`Trait.visible(SomeSel.thing)`) is an inline selector. `Trait.url(...)` takes a URLPatternInit, never a selector.
 */
const SELECTOR_TRAITS = new Set(["Trait.visible", "Trait.text", "textEquals", "visible"]);


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
    } catch (err) {
      reportImportError(relative(projectDir, file), err);
      continue;
    }
    // The calls in the Block's own file, read from the AST: a comment or a string that mentions page.goto doesn't count.
    const fileCalls = calls(parseSource(file));
    for (const [exportName, exported] of Object.entries(mod)) {
      if (!isBlockLike(exported)) continue;
      // Nav-escape: NavBlocks are exempt (their generated act() is the one legitimate goto/click call site).
      if (!isNavBlockMarked(exported) && fileCalls.some((c) => NAV_METHODS.has(c.callee))) {
        navWarnings.push({ file, blockName: exported.name, exportName });
      }
      // Inline selector: every Block kind, NavBlocks too - a Nav's own `verify` array can inline a selector.
      if (fileCalls.some((c) => c.literalFirstArg && SELECTOR_TRAITS.has(c.callee))) {
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
