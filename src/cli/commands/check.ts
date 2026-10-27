import { relative, resolve } from "node:path";
import { findOrphanBlocks } from "../../analysis/graph.js";
import { checkMapGroups, checkProject, validateFlows } from "../../analysis/check.js";
import { parseRunFlags } from "../flags.js";
import { walkDir } from "../../manifest/scan.js";
import { collectPracticeWarnings, practiceKindLabel } from "../../analysis/practices-check.js";
import type { PracticeWarning } from "../../analysis/practices-check.js";

function printOrphanReport(projectDir: string, orphans: Awaited<ReturnType<typeof findOrphanBlocks>>): void {
  if (orphans.length === 0) {
    console.log(`waygraph check: no orphan Blocks (every *.block.ts export is wired into a flow)`);
    return;
  }
  for (const o of orphans) {
    console.warn(
      `waygraph check: orphan Block ${o.file} (${o.exportName} / "${o.block}") is not used in any flow - wire it into a .flow.ts before chain auto shorthand`,
    );
  }
  console.log(`waygraph check: ${orphans.length} orphan Block${orphans.length === 1 ? "" : "s"}`);
}


function printPracticeReport(
  projectDir: string,
  practiceWarnings: PracticeWarning[],
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
      const flags = parseRunFlags(args.slice(1), args[0] ?? "check");
      const proj = resolve(flags.positionals[0] ?? process.cwd());
      await runTypecheckCommand(proj, flags.noPractices === true);
      return;
}

export async function checkCase(args: string[]): Promise<void> {
      const flags = parseRunFlags(args.slice(1), args[0] ?? "check");
      const proj = resolve(flags.positionals[0] ?? process.cwd());
      const { navWarnings, selWarnings, practiceWarnings, constantDataWarnings } = await checkProject(
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
      for (const w of constantDataWarnings) {
        console.warn(`waygraph check: ${relative(proj, w.file)} (${w.blockName}) requires ${w.key}, whose mem stub gives the same value every run - a second run may collide with the first; build it from ctx.unique: registerMemStub(key, ({ unique }) => ...)`);
      }
      if (constantDataWarnings.length > 0) console.log(`waygraph check: ${constantDataWarnings.length} constant test data warning${constantDataWarnings.length === 1 ? "" : "s"}`);
      const groupProblems = checkMapGroups(proj);
      for (const p of groupProblems) {
        console.warn(`waygraph check: ${relative(proj, p.file)} imports "${p.spec}" from outside map group ${p.group} - a group imports only waygraph and its own files, so it can be packed`);
      }
      if (groupProblems.length > 0) console.log(`waygraph check: ${groupProblems.length} map group import warning${groupProblems.length === 1 ? "" : "s"}`);
      const orphans = await findOrphanBlocks(proj);
      printOrphanReport(proj, orphans);
      // Warnings only - never fail exit code. Orphans are reported for
      // human/agent cleanup; chain auto refuses while any remain.
      return;
}
