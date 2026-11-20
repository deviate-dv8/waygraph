// `waygraph info [project] [--verbose] [--json]`: what waygraph sees in the project, for "why isn't it picking that up".
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { normalizeLabels } from "../../manifest/labels.js";
import { buildManifest } from "../../manifest/manifest.js";
import { chooseSet, leftOutOf, regressionSets } from "../../manifest/regression.js";
import { envMode } from "../../runtime/env-file.js";
import { configAsJson, configFileOf, loadWaygraphConfig, resolveBaseUrl } from "../../runtime/waygraph-config.js";
import { envString } from "../../engine/env.js";
import { parseCommand } from "../args.js";
import { projectDirOf } from "../util.js";

const SECRET = /pass|secret|token|key|auth|cookie/i;

/** The version of a package the project resolves, or undefined when it can't be found. */
function versionIn(projectDir: string, name: string): string | undefined {
  try {
    const file = createRequire(join(projectDir, "package.json")).resolve(`${name}/package.json`);
    return (JSON.parse(readFileSync(file, "utf8")) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

const countBy = <T>(items: readonly T[], key: (item: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
};

const line = (label: string, value: string | undefined) => console.log(`  ${label.padEnd(11)} ${value ?? "-"}`);
const kinds = (counts: Record<string, number>) => Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(", ") || "none";

export async function infoCase(args: string[]): Promise<void> {
  const { values, positionals } = parseCommand("info", {
    verbose: { type: "boolean", help: "Also list the flows, Blocks, accounts, the config's values and the WAYGRAPH_* variables set" },
    json: { type: "boolean", help: "Print it as JSON" },
  }, args.slice(1));
  const proj = projectDirOf("info", positionals[0]);
  const loaded = await loadWaygraphConfig(proj);
  const file = configFileOf(proj);
  const baseUrl = await resolveBaseUrl(proj);
  const baseFrom = envString("WAYGRAPH_BASE_URL") ? "WAYGRAPH_BASE_URL" : loaded?.baseUrl ? "the config" : undefined;
  const set = chooseSet(loaded?.regression);
  const manifest = await buildManifest(proj, { baseUrl, ...(file ? { config: { file, values: configAsJson(loaded) } } : {}), labels: normalizeLabels(loaded?.labels), regression: set });
  const mode = envMode();
  const envFiles = [".env", ".env.local", `.env.${mode}`, `.env.${mode}.local`].filter((name) => existsSync(join(proj, name)));
  const sets = regressionSets(loaded?.regression);
  const blocks = countBy(manifest.blocks, (b) => b.kind);
  const leftOut = manifest.flows.filter((f) => leftOutOf(set, f.labels));
  const labels = [...new Set([...Object.keys(normalizeLabels(loaded?.labels)), ...manifest.flows.flatMap((f) => f.labels)])].sort();
  const waygraphEnv = Object.entries(process.env).filter(([k]) => k.startsWith("WAYGRAPH_")).map(([k, v]) => [k, SECRET.test(k) ? "***" : (v ?? "")] as const);

  const info = {
    waygraph: manifest.project.waygraph,
    node: process.version,
    playwright: versionIn(proj, "@playwright/test"),
    project: { name: manifest.project.name, dir: proj },
    config: file ?? null,
    baseUrl: baseUrl ?? null,
    baseUrlFrom: baseFrom ?? null,
    env: { mode, files: envFiles },
    labels,
    regression: { sets: Object.keys(sets), leftOutOfDefault: leftOut.map((f) => f.exportName) },
    counts: {
      flows: manifest.flows.length,
      blocks: manifest.blocks.length,
      blocksByKind: blocks,
      pages: manifest.pages.length,
      checkpoints: manifest.checkpoints.length,
      states: manifest.states.length,
      accounts: manifest.accounts.length,
      layouts: manifest.layouts.length,
      readBlocks: manifest.readBlocks.length,
      selectors: manifest.selectors.length,
      skippedFiles: manifest.skipped.length,
    },
    ...(values.verbose
      ? {
          flows: manifest.flows.map((f) => ({ name: f.exportName, file: f.file, labels: f.labels, steps: f.steps.length, ...(leftOutOf(set, f.labels) ? { leftOut: leftOutOf(set, f.labels) } : {}) })),
          blocks: manifest.blocks.map((b) => ({ name: b.name, kind: b.kind, file: b.file })),
          accounts: manifest.accounts,
          skipped: manifest.skipped,
          configValues: configAsJson(loaded),
          waygraphEnv: Object.fromEntries(waygraphEnv),
        }
      : {}),
  };
  if (values.json) {
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  console.log(`waygraph ${info.waygraph}   node ${info.node}   playwright ${info.playwright ?? "not found"}`);
  console.log("project");
  line("name", info.project.name);
  line("dir", proj);
  line("config", file);
  line("baseUrl", baseUrl ? `${baseUrl}${baseFrom ? `  (from ${baseFrom})` : ""}` : undefined);
  line("env", `${mode}${envFiles.length ? `  (${envFiles.join(", ")})` : "  (no .env files)"}`);
  console.log("found");
  line("flows", `${info.counts.flows}${leftOut.length ? `  (${leftOut.length} left out of the default full run)` : ""}`);
  line("blocks", `${info.counts.blocks}  (${kinds(blocks)})`);
  line("pages", `${info.counts.pages}   checkpoints ${info.counts.checkpoints}   states ${info.counts.states}`);
  line("accounts", `${info.counts.accounts}   layouts ${info.counts.layouts}   reads ${info.counts.readBlocks}   selectors ${info.counts.selectors}`);
  if (manifest.skipped.length) line("skipped", `${manifest.skipped.length} file(s) that didn't load (waygraph check names them)`);
  console.log("labels and regression");
  line("labels", labels.join(", ") || "none");
  line("regression", Object.keys(sets).length ? Object.entries(sets).map(([n, s]) => `${n}${s.include?.length ? ` include ${s.include.join("|")}` : ""}${s.exclude?.length ? ` exclude ${s.exclude.join("|")}` : ""}`).join("; ") : "every flow runs");
  if (values.verbose) {
    console.log("flows");
    for (const f of info.flows ?? []) console.log(`  ${f.name}  ${f.file}  [${f.labels.join(", ")}]  ${f.steps} steps${f.leftOut ? `  (left out: ${f.leftOut})` : ""}`);
    console.log("blocks");
    for (const [kind, n] of Object.entries(blocks)) console.log(`  ${kind} (${n}): ${manifest.blocks.filter((b) => b.kind === kind).map((b) => b.name).join(", ")}`);
    if (manifest.accounts.length) { console.log("accounts"); console.log(`  ${manifest.accounts.join(", ")}`); }
    console.log("config values");
    console.log(JSON.stringify(info.configValues ?? {}, null, 2).split("\n").map((l) => `  ${l}`).join("\n"));
    console.log("WAYGRAPH_* variables set");
    for (const [k, v] of waygraphEnv) console.log(`  ${k}=${v}`);
    if (!waygraphEnv.length) console.log("  none");
  } else {
    console.log("  (--verbose lists the flows, Blocks, config values and variables; --json for a machine)");
  }
}
