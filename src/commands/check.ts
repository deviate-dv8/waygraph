// Split out of the former 8,700-line cli.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { INLINE_SELECTOR_CALL, NAV_METHOD_CALLS, discoverBlocks, discoverFlows, importFlowFile, importModule, isBlockLike, isFlowLike, isNavBlockMarked, walkDir } from "../cli/discover.js";
import { basename, relative, resolve } from "node:path";
import { discoverGraph, findBlockPath, findOrphanBlocks } from "../graph.js";
import { parseRunFlags, resolveBaseUrl } from "../cli/flags.js";
import { runChain } from "../cli/run-chain.js";
import { collectPracticeWarnings, practiceKindLabel } from "../practices-check.js";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// `validate`
// ---------------------------------------------------------------------------

interface FlowInfo {
  file: string;
  name: string;
  valid: boolean;
  error?: string;
}


async function validateFlows(projectDir: string): Promise<FlowInfo[]> {
  const files = discoverFlows(projectDir);
  const results: FlowInfo[] = [];
  for (const file of files) {
    try {
      const mod = await importFlowFile(file);
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


interface CheckWarning {
  file: string;
  blockName: string;
  exportName: string;
}


interface SelWarning {
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
function printOrphanReport(projectDir: string, orphans: Awaited<ReturnType<typeof findOrphanBlocks>>): void {
  if (orphans.length === 0) {
    console.log(`waygraph check: no orphan Blocks (every *.block.ts export is wired into a flow)`);
    return;
  }
  for (const o of orphans) {
    console.warn(
      `waygraph check: orphan Block ${o.file} (${o.exportName} / "${o.block}") is not referenced in any defineFlow([...]) - wire it into a .flow.ts before chain auto shorthand`,
    );
  }
  console.log(`waygraph check: ${orphans.length} orphan Block${orphans.length === 1 ? "" : "s"}`);
}


async function requireNoOrphans(projectDir: string, forCommand: string): Promise<boolean> {
  const orphans = await findOrphanBlocks(projectDir);
  if (orphans.length === 0) return true;
  console.error(
    `waygraph ${forCommand}: ${orphans.length} orphan Block(s) - wire every Block into a .flow.ts before auto shorthand. Run: waygraph check ${projectDir === process.cwd() ? "." : JSON.stringify(projectDir)}`,
  );
  for (const o of orphans) {
    console.error(`  - ${o.file} (${o.exportName} / "${o.block}")`);
  }
  process.exitCode = 1;
  return false;
}


export async function runChainAuto(projectDir: string, fromTag: string, toTag: string): Promise<void> {
  if (!(await requireNoOrphans(projectDir, "chain auto"))) return;
  const graph = await discoverGraph(projectDir);
  const path = findBlockPath(graph, fromTag, toTag);
  if (!path) {
    console.error(`waygraph chain auto: no Block path from "${fromTag}" to "${toTag}" in the discovered graph`);
    process.exitCode = 1;
    return;
  }
  const spec = path.join(" then ");
  console.error(`waygraph chain auto: ${fromTag} -> ${toTag} via ${spec}`);
  if (!process.env.WAYGRAPH_BASE_URL) {
    const resolved = resolveBaseUrl(projectDir);
    if (resolved) process.env.WAYGRAPH_BASE_URL = resolved;
  }
  await runChain(projectDir, spec);
}


function printPracticeReport(
  projectDir: string,
  practiceWarnings: import("../practices-check.js").PracticeWarning[],
): void {
  if (practiceWarnings.length === 0) {
    console.log(`waygraph check: no bad-practice patterns under ${projectDir}`);
    return;
  }
  for (const w of practiceWarnings) {
    console.warn(`waygraph check: ${w.file} (${practiceKindLabel(w.kind)}) — ${w.detail}`);
  }
  console.log(
    `waygraph check: ${practiceWarnings.length} bad-practice warning${practiceWarnings.length === 1 ? "" : "s"}`,
  );
}


async function checkCommand(
  projectDir: string,
  opts?: { noPractices?: boolean },
): Promise<{
  navWarnings: CheckWarning[];
  selWarnings: SelWarning[];
  practiceWarnings: import("../practices-check.js").PracticeWarning[];
}> {
  const files = discoverBlocks(projectDir);
  const navWarnings: CheckWarning[] = [];
  const selWarnings: SelWarning[] = [];
  for (const file of files) {
    let mod: Record<string, unknown>;
    try {
      mod = await importModule(file);
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
        !isNavBlockMarked(exported as Record<string, unknown>) &&
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


async function runTypecheckCommand(projectDir: string, noPractices: boolean): Promise<void> {
  const { spawnSync } = await import("node:child_process");
  const tsc = spawnSync("npx", ["tsc", "--noEmit"], {
    cwd: projectDir,
    stdio: "inherit",
    shell: false,
  });
  if (tsc.status !== 0) {
    process.exit(tsc.status === null ? 1 : tsc.status);
  }
  if (noPractices) return;
  const practiceWarnings = collectPracticeWarnings(projectDir, walkDir);
  printPracticeReport(projectDir, practiceWarnings);
}

export async function validateCase(args: string[]): Promise<void> {
      const proj = resolve(args[1] ?? process.cwd());
      const results = await validateFlows(proj);
      let failed = 0;
      for (const r of results) {
        const rel = relative(proj, r.file);
        if (r.valid) {
          console.log(`OK    ${rel}  ${r.name}`);
        } else {
          failed++;
          console.log(`FAIL  ${rel}  ${r.name} -- ${r.error}`);
        }
      }
      if (failed > 0) process.exitCode = 1;
      return;
}

export async function typecheckCase(args: string[]): Promise<void> {
      const flags = parseRunFlags(args.slice(1));
      const proj = resolve(flags.positionals[0] ?? process.cwd());
      await runTypecheckCommand(proj, flags.noPractices === true);
      return;
}

export async function checkCase(args: string[]): Promise<void> {
      const flags = parseRunFlags(args.slice(1));
      const proj = resolve(flags.positionals[0] ?? process.cwd());
      const { navWarnings, selWarnings, practiceWarnings } = await checkCommand(
        proj,
        flags.noPractices ? { noPractices: true } : undefined,
      );
      if (navWarnings.length === 0) {
        console.log(`waygraph check: no navigation found outside NavBlocks under ${proj}`);
      } else {
        for (const w of navWarnings) {
          const rel = relative(proj, w.file);
          console.warn(`waygraph check: ${rel} (${w.blockName}) calls page.goto/reload/goBack/goForward outside a NavBlock - consider defineNavBlock instead`);
        }
        console.log(`waygraph check: ${navWarnings.length} nav warning${navWarnings.length === 1 ? "" : "s"}`);
      }
      if (selWarnings.length === 0) {
        console.log(`waygraph check: no inline selectors found in verify arrays under ${proj}`);
      } else {
        for (const w of selWarnings) {
          const rel = relative(proj, w.file);
          console.warn(`waygraph check: ${rel} (${w.blockName}) has an inline selector literal in verify - move it into a *Sel object`);
        }
        console.log(`waygraph check: ${selWarnings.length} inline-selector warning${selWarnings.length === 1 ? "" : "s"}`);
      }
      if (!flags.noPractices) {
        printPracticeReport(proj, practiceWarnings);
      }
      const orphans = await findOrphanBlocks(proj);
      printOrphanReport(proj, orphans);
      // Warnings only - never fail exit code. Orphans are reported for
      // human/agent cleanup; chain auto refuses while any remain.
      return;
}
