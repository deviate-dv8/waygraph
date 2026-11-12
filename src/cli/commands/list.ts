import { blockExportToLabel, extractFlowNames, extractGotos, extractUrlTraits, parseBlockImports } from "../../analysis/flow-source.js";
import { walkDir } from "../../manifest/scan.js";
import { exportedNames, parseSource } from "../../manifest/source.js";
import { relative, resolve } from "node:path";
import { projectDirOf } from "../util.js";
import { parseCommand } from "../args.js";
import { flowLabels } from "../../manifest/labels.js";
import { importFresh, isFlowLike } from "../../manifest/scan.js";
import { loadWaygraphConfig } from "../../runtime/waygraph-config.js";

// ---------------------------------------------------------------------------
// `list`
// ---------------------------------------------------------------------------

/** Every flow, with its labels (the config's); `label` keeps only the flows with it. */
async function listCommand(projectDir: string, label: string | undefined): Promise<void> {
  const files = walkDir(projectDir, /\.flow\.ts$/);
  if (files.length === 0) {
    console.log(`waygraph: no flows found under ${projectDir}`);
    return;
  }
  const labels = (await loadWaygraphConfig(projectDir))?.labels;
  const rows: { rel: string; name: string; its: string[]; title?: string }[] = [];
  for (const file of files) {
    const rel = relative(projectDir, file);
    let mod: Record<string, unknown>;
    try {
      mod = await importFresh(file);
    } catch {
      // A file that doesn't load still lists its flows, by name.
      for (const name of extractFlowNames(file)) rows.push({ rel, name, its: flowLabels(undefined, labels, rel, name) });
      continue;
    }
    for (const [name, value] of Object.entries(mod)) {
      if (!isFlowLike(value)) continue;
      const meta = (value as { meta?: { labels?: readonly string[]; title?: string } }).meta;
      rows.push({ rel, name, its: flowLabels(meta?.labels, labels, rel, name), ...(meta?.title ? { title: meta.title } : {}) });
    }
  }
  const known = [...new Set(rows.flatMap((r) => r.its))].sort();
  if (label && !known.includes(label)) {
    console.error(`waygraph list: ${label} isn't a label; the labels: ${known.join(", ") || "none"}`);
    process.exitCode = 1;
    return;
  }
  for (const r of rows) {
    if (label && !r.its.includes(label)) continue;
    console.log(`${r.rel}  ${r.name}${r.its.length ? `  [${r.its.join(", ")}]` : ""}${r.title ? `  ${r.title}` : ""}`);
  }
}


// ---------------------------------------------------------------------------
// `nav`
// ---------------------------------------------------------------------------

function navCommand(projectDir: string, flowName: string | undefined): void {
  const files = walkDir(projectDir, /\.flow\.ts$/);
  const targets = flowName
    ? files.filter((f) => extractFlowNames(f).includes(flowName))
    : files;
  if (targets.length === 0) {
    console.error(
      flowName
        ? `waygraph nav: no flow named "${flowName}" found under ${projectDir}`
        : `waygraph: no flows found under ${projectDir}`,
    );
    process.exitCode = 1;
    return;
  }
  let scanned: { file: string; exports: string[] }[] | undefined;
  const blockFiles = () => (scanned ??= walkDir(projectDir, /\.block\.ts$/).map((f) => ({ file: f, exports: exportedNames(parseSource(f)) })));
  for (const file of targets) {
    for (const name of extractFlowNames(file)) {
      console.log(`${name}  (${relative(projectDir, file)})`);
      for (const blockExport of parseBlockImports(file)) {
        console.log(`  -> ${blockExportToLabel(blockExport)}`);
        const blockFile = blockFiles().find((f) => f.exports.includes(blockExport))?.file;
        if (!blockFile) continue;
        for (const url of extractGotos(blockFile)) console.log(`       goto ${url}`);
        for (const url of extractUrlTraits(blockFile)) console.log(`       verify url ~ ${url}`);
      }
    }
  }
}

export async function listCase(args: string[]): Promise<void> {
  const { values, positionals } = parseCommand("list", { label: { type: "string", help: "Only the flows with this label" } }, args.slice(1));
  await listCommand(projectDirOf("list", positionals[0]), values.label);
}

export async function navCase(args: string[]): Promise<void> {
      const flowName = args[1] && args[1] !== "." ? args[1] : undefined;
      const proj = resolve(args[2] ?? process.cwd());
      navCommand(proj, flowName);
      return;
}
