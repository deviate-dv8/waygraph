import { blockExportToLabel, extractFlowNames, extractGotos, extractUrlTraits, parseBlockImports } from "../../analysis/source.js";
import { walkDir } from "../../manifest/scan.js";
import { exportedNames, parseSource } from "../../manifest/source.js";
import { relative, resolve } from "node:path";
import { existsSync } from "node:fs";

// ---------------------------------------------------------------------------
// `list`
// ---------------------------------------------------------------------------

function listCommand(projectDir: string): void {
  const files = walkDir(projectDir, /\.flow\.ts$/);
  if (files.length === 0) {
    console.log(`waygraph: no flows found under ${projectDir}`);
    return;
  }
  for (const file of files) {
    const rel = relative(projectDir, file);
    for (const name of extractFlowNames(file)) {
      console.log(`${rel}  ${name}`);
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
      const proj = resolve(args[1] ?? process.cwd());
      if (!existsSync(proj)) {
        console.error(`waygraph: no such directory: ${proj}`);
        process.exit(1);
      }
      listCommand(proj);
      return;
}

export async function navCase(args: string[]): Promise<void> {
      const flowName = args[1] && args[1] !== "." ? args[1] : undefined;
      const proj = resolve(args[2] ?? process.cwd());
      navCommand(proj, flowName);
      return;
}
