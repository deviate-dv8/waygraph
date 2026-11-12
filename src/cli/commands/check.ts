import { findStatePages } from "../../analysis/state-pages.js";
import { buildManifest } from "../../manifest/manifest.js";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { findOrphanBlocks } from "../../analysis/graph.js";
import { checkMapGroups, checkProject, validateFlows } from "../../analysis/check.js";
import { checkAccess } from "../../analysis/access-check.js";
import { parseRunFlags } from "../flags.js";
import { walkDir } from "../../manifest/scan.js";
import { collectPracticeWarnings, practiceKindLabel } from "../../analysis/practices-check.js";
import type { PracticeWarning } from "../../analysis/practices-check.js";
import { emptyLabels } from "../../manifest/labels.js";
import { loadWaygraphConfig } from "../../runtime/waygraph-config.js";

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
  // The page names `to:` and `covers:` complete from, before tsc reads them.
  await (await import("./types.js")).writePageTypes(projectDir).catch((err: unknown) => console.warn(`waygraph types: ${String(err)}`));
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

/** `waygraph check --network <run|latest>`: what the run's calls say about its pages. */
async function networkReport(proj: string, which: string): Promise<void> {
  const { defaultRunLogDir, readRunLog } = await import("../../runtime/run-log.js");
  const { readdirSync } = await import("node:fs");
  const { networkFindings } = await import("../../analysis/network-check.js");
  const dir = defaultRunLogDir(proj);
  const id = which === "latest" || which === "" ? readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort().at(-1) : which;
  if (!id) return void console.error(`waygraph check: no run logs in ${dir}`);
  const events = readRunLog(proj, id);
  const calls = events.filter((e) => e.type === "step:call").length;
  const findings = networkFindings(events);
  for (const f of findings) console.warn(`waygraph check: ${f.page} (step ${f.step + 1}) ${f.kind}: ${f.what} - ${f.detail}`);
  console.log(`waygraph check: ${calls} call${calls === 1 ? "" : "s"} in ${id.replace(/\.jsonl$/, "")}, ${findings.length} finding${findings.length === 1 ? "" : "s"}`);
}

export async function checkCase(args: string[]): Promise<void> {
      const flags = parseRunFlags(args.slice(1), args[0] ?? "check");
      const proj = resolve(flags.positionals[0] ?? process.cwd());
      if (flags.network !== undefined) return networkReport(proj, flags.network);
      await (await import("./types.js")).writePageTypes(proj).catch((err: unknown) => console.warn(`waygraph types: ${String(err)}`));
      const { navWarnings, selWarnings, practiceWarnings, constantDataWarnings, unreadPages } = await checkProject(
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
      // Selectors `waygraph gen` wrote and nobody has filled in.
      const unfinished = walkDir(proj, /(?:^|[\\/.])_?sel\.ts$/).flatMap((file) =>
        readFileSync(file, "utf8")
          .split("\n")
          .flatMap((line, i) => (/:\s*"TODO"/.test(line) ? [`${relative(proj, file)}:${i + 1}  ${line.trim()}`] : [])),
      );
      for (const u of unfinished) console.warn(`waygraph check: unfinished selector ${u}`);
      if (unfinished.length) console.log(`waygraph check: ${unfinished.length} selector${unfinished.length === 1 ? "" : "s"} still "TODO" (from waygraph gen)`);
      for (const w of constantDataWarnings) {
        console.warn(`waygraph check: ${relative(proj, w.file)} (${w.blockName}) makes something, but ${w.key} gives the same value every run and none of its keys is new every run - a second run may make the same thing again; build the name of what it makes from unique: registerMemStub(key, ({ unique }) => ...)`);
      }
      for (const p of unreadPages) {
        console.warn(`waygraph check: page ${p.checkpoint} has no read - say what it shows (a "read:" on the page in ${relative(proj, p.file)}), so runs, agents and tests can read it`);
      }
      if (unreadPages.length > 0) console.log(`waygraph check: ${unreadPages.length} page${unreadPages.length === 1 ? "" : "s"} without a read`);
      if (constantDataWarnings.length > 0) console.log(`waygraph check: ${constantDataWarnings.length} constant test data warning${constantDataWarnings.length === 1 ? "" : "s"}`);
      const groupProblems = checkMapGroups(proj);
      for (const p of groupProblems) {
        console.warn(`waygraph check: ${relative(proj, p.file)} imports "${p.spec}" from outside map group ${p.group} - a group imports only waygraph and its own files, so it can be packed`);
      }
      if (groupProblems.length > 0) console.log(`waygraph check: ${groupProblems.length} map group import warning${groupProblems.length === 1 ? "" : "s"}`);
      const manifest = await buildManifest(proj);
      const statePages = findStatePages(manifest);
      for (const s of statePages) {
        const why = s.sharesWith
          ? `has ${s.sharesWith.page}'s address (${s.sharesWith.address})`
          : `has no address of its own and only Methods land on it (${s.reachedBy!.join(", ")})`;
        console.warn(`waygraph check: Checkpoint ${s.checkpoint} ${why}, and nothing starts from it - a state of a page, not a page: keep the page's Checkpoint and say what changed in its Read Block (a field the step's verify or expect checks)`);
      }
      if (statePages.length > 0) console.log(`waygraph check: ${statePages.length} Checkpoint${statePages.length === 1 ? "" : "s"} that ${statePages.length === 1 ? "is a state" : "are states"} of a page`);
      // A flow with no description doesn't say what it proves: not to a QA reading the list, not to the demo's opening.
      const undescribed = manifest.flows.filter((f) => !f.description);
      if (undescribed.length && undescribed.length < manifest.flows.length) {
        console.log(`waygraph check: ${undescribed.length} flow${undescribed.length === 1 ? "" : "s"} without a description (map({ title, description, labels })): ${undescribed.slice(0, 5).map((f) => f.exportName).join(", ")}${undescribed.length > 5 ? ", …" : ""}`);
      }
      const labels = (await loadWaygraphConfig(proj))?.labels;
      for (const label of emptyLabels(labels, manifest.flows)) {
        console.warn(`waygraph check: label ${label} covers no flow (${(labels?.[label] ?? []).join(", ") || "no patterns"}) - a glob over flow files (src/flows/auth/**) or a flow's export name`);
      }
      const access = await checkAccess(proj);
      for (const a of access) {
        console.warn(`waygraph check: ${a.file} (${a.flow}) runs as ${a.account}, but ${a.what} is only for ${a.given.join(", ")} - run it as one of them, or give ${a.account} ${a.what} (its for)`);
      }
      if (access.length > 0) console.log(`waygraph check: ${access.length} step${access.length === 1 ? "" : "s"} an account isn't given`);
      const orphans = await findOrphanBlocks(proj);
      printOrphanReport(proj, orphans);
      // Warnings only - never fail exit code. Orphans are reported for
      // human/agent cleanup; chain auto refuses while any remain.
      return;
}
