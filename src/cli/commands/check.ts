import { findStatePages } from "../../analysis/state-pages.js";
import { findUnknownPages, type UnknownPage } from "../../analysis/page-names.js";
import { buildManifest } from "../../manifest/manifest.js";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { findOrphanBlocks } from "../../analysis/graph.js";
import { checkMapGroups, checkProject, validateFlows } from "../../analysis/check.js";
import { checkStates } from "../../analysis/state-check.js";
import { checkAccess } from "../../analysis/access-check.js";
import { parseRunFlags } from "../flags.js";
import { walkDir } from "../../manifest/scan.js";
import { collectPracticeWarnings, practiceKindLabel } from "../../analysis/practices-check.js";
import type { PracticeWarning } from "../../analysis/practices-check.js";
import { emptyLabels, normalizeLabels } from "../../manifest/labels.js";
import { unknownInSets } from "../../manifest/regression.js";
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


/** Each page name that names no page, with the page it probably meant. */
function printUnknownPages(unknown: readonly UnknownPage[]): void {
  for (const u of unknown) {
    console.warn(`waygraph check: ${u.page} names the page "${u.name}" in its ${u.where}, and no page has that name${u.suggestion ? ` - did you mean "${u.suggestion}"?` : ""}`);
  }
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
  // A page named by a string that no Page Block makes: the scan checks what the types can't see.
  const unknown = findUnknownPages(await buildManifest(projectDir));
  printUnknownPages(unknown);
  if (unknown.length > 0) process.exit(1);
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
  const findings = networkFindings(events, (await loadWaygraphConfig(proj))?.network?.thresholds);
  for (const f of findings) console.warn(`waygraph check: ${f.page} (step ${f.step + 1}) ${f.kind}: ${f.what} - ${f.detail}`);
  console.log(`waygraph check: ${calls} call${calls === 1 ? "" : "s"} in ${id.replace(/\.jsonl$/, "")}, ${findings.length} finding${findings.length === 1 ? "" : "s"}`);
}

export async function checkCase(args: string[]): Promise<void> {
      const flags = parseRunFlags(args.slice(1), args[0] ?? "check");
      const proj = resolve(flags.positionals[0] ?? process.cwd());
      if (flags.network !== undefined) return networkReport(proj, flags.network);
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
      printUnknownPages(findUnknownPages(manifest));
      if (existsSync(join(proj, "src", "waygraph-pages.d.ts"))) {
        console.warn("waygraph check: src/waygraph-pages.d.ts is no longer used (page names are checked here, not by types): delete it");
      }
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
      const labels = normalizeLabels((await loadWaygraphConfig(proj))?.labels);
      for (const label of emptyLabels(labels, manifest.flows)) {
        console.warn(`waygraph check: label ${label} is declared but no flow carries it (${(labels[label] ?? []).join(", ") || "no patterns"}) - a typo, or the flows moved`);
      }
      const config = await loadWaygraphConfig(proj);
      for (const { set, label } of unknownInSets(config?.regression, labels, manifest.flows)) {
        console.warn(`waygraph check: regression (${set}) names ${label}, which no label of the config or flow carries - a typo, or the flows moved`);
      }
      const access = await checkAccess(proj);
      for (const a of access) {
        console.warn(`waygraph check: ${a.file} (${a.flow}) runs as ${a.account}, but ${a.what} is only for ${a.given.join(", ")} - run it as one of them, or give ${a.account} ${a.what} (its for)`);
      }
      if (access.length > 0) console.log(`waygraph check: ${access.length} step${access.length === 1 ? "" : "s"} an account isn't given`);
      const stateWarnings = await checkStates(proj);
      for (const w of stateWarnings) {
        console.warn(`waygraph check: ${w.file} (${w.flow}) step ${w.step} lands on ${w.page}, which needs ${w.missing.join(", ")}: nothing before it sets ${w.missing.length === 1 ? "it" : "them"} (run as an account that has ${w.missing.length === 1 ? "it" : "them"}, or add a step with sets)`);
      }
      if (stateWarnings.length > 0) console.log(`waygraph check: ${stateWarnings.length} step${stateWarnings.length === 1 ? "" : "s"} landing on a page whose state the flow isn't in`);
      const orphans = await findOrphanBlocks(proj);
      printOrphanReport(proj, orphans);
      // Warnings only - never fail exit code. Orphans are reported for
      // human/agent cleanup; chain auto refuses while any remain.
      return;
}
