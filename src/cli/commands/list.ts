import { blockExportToLabel, extractFlowNames, extractGotos, extractUrlTraits, parseBlockImports } from "../../analysis/flow-source.js";
import { walkDir } from "../../manifest/scan.js";
import { exportedNames, parseSource } from "../../manifest/source.js";
import { relative, resolve } from "node:path";
import { projectDirOf } from "../util.js";
import { parseCommand } from "../args.js";
import { labelsOf } from "../../manifest/labels.js";
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
  if (label && !labels?.[label]) {
    console.error(`waygraph list: ${label} isn't a label; the config's labels: ${Object.keys(labels ?? {}).join(", ") || "none"}`);
    process.exitCode = 1;
    return;
  }
  for (const file of files) {
    const rel = relative(projectDir, file);
    for (const name of extractFlowNames(file)) {
      const its = labelsOf(labels, rel, name);
      if (label && !its.includes(label)) continue;
      console.log(`${rel}  ${name}${its.length ? `  [${its.join(", ")}]` : ""}`);
    }
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
