// `waygraph validate` and `waygraph check`: does every Flow file load, and do Blocks keep navigation and selectors where
// they belong. Warnings only.
import { messageOf } from "../engine/errors.js";
import { basename, relative } from "node:path";
import { importFresh, isBlockLike, isFlowLike, isReadBlockLike, walkDir } from "../manifest/scan.js";
import { calls, parseSource } from "../manifest/source.js";
import { collectPracticeWarnings } from "./practices-check.js";
import type { PracticeWarning } from "./practices-check.js";
import { mapGroups } from "../manifest/maps.js";
import { loadMemStubs, reportImportError } from "../manifest/project.js";
import { mapGroupImportProblems } from "../manifest/map-imports.js";
import { blockKindOf } from "../engine/block/kind.js";
import { memStubIsConstant } from "../engine/mem/mem-stub.js";
import type { MemKey } from "../engine/mem/mem.js";
import type { MapImportProblem } from "../manifest/map-imports.js";

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
      const msg = messageOf(err);
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
/** A page (a Checkpoint a Nav or Page Block lands on) that no Read Block reads. */
export interface UnreadPage {
  checkpoint: string;
  /** A Block that lands there: where its Read Block belongs. */
  file: string;
}

/** A Block named like a create. */
const CREATES = /^(?:create|register|sign-?up|new|insert)-/;
/**
 * Whether a Block makes something a second run would collide with: one named like a create, or an API call that POSTs
 * (one with no `method` counts: it may). A GET only reads; a PUT, PATCH or DELETE changes something that's already there.
 */
function creates(block: { name: string }): boolean {
  if (CREATES.test(block.name)) return true;
  if (blockKindOf(block) !== "api") return false;
  const method = (block as { __waygraphApiMethod?: string }).__waygraphApiMethod;
  return method === undefined || method === "POST";
}

/** A Block that creates something, requiring a key whose mem stub returns the same value every run. */
export interface ConstantDataWarning {
  file: string;
  blockName: string;
  key: string;
}

export async function checkProject(
  projectDir: string,
  opts?: { noPractices?: boolean },
): Promise<{
  navWarnings: CheckWarning[];
  selWarnings: SelWarning[];
  practiceWarnings: PracticeWarning[];
  constantDataWarnings: ConstantDataWarning[];
  unreadPages: UnreadPage[];
}> {
  const files = walkDir(projectDir, /\.block\.ts$/);
  const navWarnings: CheckWarning[] = [];
  const selWarnings: SelWarning[] = [];
  const constantDataWarnings: ConstantDataWarning[] = [];
  // Pages (where a Nav / Page Block lands) and what the Read Blocks read: a page should say what it shows.
  const pages = new Map<string, string>();
  const read = new Set<string>();
  // Mem stubs are registered where a project keeps them; load those before asking them.
  await loadMemStubs(projectDir);
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
      if (isReadBlockLike(exported)) for (const tag of exported.from) read.add(tag);
      if (!isBlockLike(exported)) continue;
      // A page's own `read:` is a Read Block of the page.
      const own = (exported as { __waygraphReadBlock?: { from: readonly string[] } }).__waygraphReadBlock;
      if (own) for (const tag of own.from) read.add(tag);
      const kind = blockKindOf(exported);
      if (kind === "nav" || kind === "page") {
        for (const tag of (exported as { __waygraphTo?: readonly string[] }).__waygraphTo ?? []) if (!pages.has(tag)) pages.set(tag, file);
      }
      // Nav-escape: NavBlocks are exempt (their generated act() is the one legitimate goto/click call site).
      if (!isNavBlockMarked(exported) && fileCalls.some((c) => NAV_METHODS.has(c.callee))) {
        navWarnings.push({ file, blockName: exported.name, exportName });
      }
      // Inline selector: every Block kind, NavBlocks too - a Nav's own `verify` array can inline a selector.
      if (fileCalls.some((c) => c.literalFirstArg && SELECTOR_TRAITS.has(c.callee))) {
        selWarnings.push({ file, blockName: exported.name, exportName });
      }
      // What it makes is named by a key that's new every run (from `unique`); its other keys (a sign-in token, an area)
      // are the same every run by design. Only a Block whose every stubbed key is the same every run makes the same
      // thing twice.
      if (creates(exported)) {
        const required = (exported as { requires?: readonly MemKey<unknown>[] }).requires ?? [];
        const constant = required.filter((key) => memStubIsConstant(key) === true);
        if (!required.some((key) => memStubIsConstant(key) === false)) {
          for (const key of constant) constantDataWarnings.push({ file, blockName: exported.name, key: key.name });
        }
      }
    }
  }
  const practiceWarnings = collectPracticeWarnings(projectDir, walkDir, {
    disabled: opts?.noPractices === true,
  });
  const unreadPages = [...pages].filter(([tag]) => tag !== "*" && !read.has(tag)).map(([checkpoint, file]) => ({ checkpoint, file }));
  return { navWarnings, selWarnings, practiceWarnings, constantDataWarnings, unreadPages };
}


/** Imports in each packable map group that reach outside it (see `manifest/maps.ts`). */
export function checkMapGroups(projectDir: string): (MapImportProblem & { group: string })[] {
  return mapGroups(projectDir).flatMap((g) => mapGroupImportProblems(g).map((p) => ({ ...p, group: g.group })));
}
