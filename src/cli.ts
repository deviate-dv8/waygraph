#!/usr/bin/env node

/**
 * waygraph CLI -- tooling around this same package's engine.
 *
 * Commands:
 *   list    [project]            List discovered flows in a project
 *   nav     [flow] [project]     Print flow chain + navigation-only steps (goto / Trait.url)
 *   validate [project]           Import and validate all flows
 *   run <flow> [project]         Run a named flow with a fresh browser
 *   chain <spec> [project]       Run one or more Blocks by name, ad hoc, no flow file needed
 *
 * "project" defaults to the current directory.
 * A project is any directory containing *.flow.ts files (typically under src/flows/).
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, rmSync, type Dirent } from "node:fs";
import { resolve, relative, join, basename } from "node:path";
import { spawn } from "node:child_process";
import { MemPage } from "./mem-page.js";

// ---------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------

function walkDir(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
      results.push(...walkDir(full, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function discoverFlows(projectDir: string): string[] {
  return walkDir(projectDir, /\.flow\.ts$/);
}

// ---------------------------------------------------------------------------
// Static analysis for `list`/`nav` (no import, regex only)
// ---------------------------------------------------------------------------

function extractFlowNames(filePath: string): string[] {
  const src = readFileSync(filePath, "utf-8");
  const names: string[] = [];
  const re = /export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[=:]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    if (name !== undefined) names.push(name);
  }
  return names;
}

/** `LoginBlock` -> `"login"`; `OverviewMetricsBlock` -> `"overview-metrics"`. */
function blockExportToLabel(exportId: string): string {
  const base = exportId.replace(/Block$/, "");
  return base
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/** Every `...Block` identifier a `.flow.ts` file imports, in source order. */
function parseBlockImports(filePath: string): string[] {
  const src = readFileSync(filePath, "utf-8");
  const names: string[] = [];
  const re = /import\s*\{([^}]*)\}\s*from\s*["'][^"']*\.block(?:\.js)?["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    for (const part of m[1]!.split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0]?.trim();
      if (name) names.push(name);
    }
  }
  return names;
}

/** Every `page.goto("...")` string literal in a file, in source order. */
function extractGotos(filePath: string): string[] {
  const src = readFileSync(filePath, "utf-8");
  const results: string[] = [];
  const re = /\.goto\(\s*["'`]([^"'`]*)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const url = m[1];
    if (url !== undefined) results.push(url);
  }
  return results;
}

/** Every `Trait.url({ pathname: "..." })` target in a file, in source order. */
function extractUrlTraits(filePath: string): string[] {
  const src = readFileSync(filePath, "utf-8");
  const results: string[] = [];
  const re = /Trait\.url\(\s*\{[^}]*pathname:\s*["'`]([^"'`]*)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const url = m[1];
    if (url !== undefined) results.push(url);
  }
  return results;
}

// ---------------------------------------------------------------------------
// `list`
// ---------------------------------------------------------------------------

function listCommand(projectDir: string): void {
  const files = discoverFlows(projectDir);
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
  const files = discoverFlows(projectDir);
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
  for (const file of targets) {
    for (const name of extractFlowNames(file)) {
      console.log(`${name}  (${relative(projectDir, file)})`);
      const blockDir = projectDir;
      for (const blockExport of parseBlockImports(file)) {
        console.log(`  -> ${blockExportToLabel(blockExport)}`);
        const blockFile = walkDir(blockDir, /\.block\.ts$/).find((f) =>
          readFileSync(f, "utf-8").includes(`export const ${blockExport}`),
        );
        if (!blockFile) continue;
        for (const url of extractGotos(blockFile)) console.log(`       goto ${url}`);
        for (const url of extractUrlTraits(blockFile)) console.log(`       verify url ~ ${url}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Dynamic import + validation
// ---------------------------------------------------------------------------

async function importModule(filePath: string): Promise<Record<string, unknown>> {
  const url = new URL(`file://${resolve(filePath)}`);
  return (await import(url.href)) as Record<string, unknown>;
}

/** Kept as a named alias - `run`/`validate` below were written against this name first. */
const importFlowFile = importModule;

function isFlowLike(val: unknown): val is { run: (...args: unknown[]) => Promise<unknown> } {
  if (val === null || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  return typeof obj.run === "function";
}

// ---------------------------------------------------------------------------
// `chain`
// ---------------------------------------------------------------------------

/**
 * `chain` cannot resolve Blocks by importing them straight into THIS
 * process: this CLI's own `waygraph` (this same package) already loaded -
 * and its engine does a top-level `import { chromium } from "playwright"`.
 * A target project like zsign-all installs its OWN real, separate copy of
 * both `waygraph` and `playwright` (never a symlink - see
 * `install-links=true`), so importing one of its `.block.ts` files pulls in
 * a second, physically different `playwright` package - which Playwright's
 * own runtime refuses outright ("Requiring @playwright/test second time"),
 * crashing every single import. Confirmed empirically against all 117 real
 * zsign-all Blocks - 100% failure rate, not a corner case.
 *
 * The fix: never let the two copies share a process. This script is
 * written into the TARGET project directory and run as its own child
 * process, so every bare `import("waygraph")` / `import("playwright")` it
 * does resolves relative to ITS OWN location on disk - the target
 * project's own `node_modules`, exclusively. This CLI's own copy never
 * loads in that process at all.
 */
const CHAIN_RUNNER_SCRIPT = `
import { readdirSync } from "node:fs";
import { join } from "node:path";

function walkDir(dir, pattern) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
      results.push(...walkDir(full, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function isBlockLike(val) {
  if (val === null || typeof val !== "object") return false;
  if (typeof val.name !== "string") return false;
  if (val.instruction === null || typeof val.instruction !== "object") return false;
  return typeof val.instruction.act === "function";
}

async function findBlock(projectDir, ref) {
  const files = walkDir(projectDir, /\\.block\\.ts$/);
  const byRuntimeName = [];
  for (const file of files) {
    let mod;
    try {
      mod = await import("file://" + file);
    } catch {
      continue;
    }
    for (const [exportName, exported] of Object.entries(mod)) {
      if (!isBlockLike(exported)) continue;
      if (exportName === ref) return { block: exported, exportName, file };
      if (exported.name === ref) byRuntimeName.push({ block: exported, exportName, file });
    }
  }
  if (byRuntimeName.length === 1) return byRuntimeName[0];
  if (byRuntimeName.length > 1) {
    throw new Error(
      "waygraph chain: \\"" + ref + "\\" matches " + byRuntimeName.length + " Blocks by name - " +
        byRuntimeName.map((b) => b.exportName + " (" + b.file + ")").join(", ") +
        ". Use the export name to disambiguate.",
    );
  }
  throw new Error("waygraph chain: no Block named \\"" + ref + "\\" found under " + projectDir);
}

function parseChainSpec(spec) {
  return spec
    .split(/\\bthen\\b/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const m = /^([A-Za-z_$][\\w-]*)\\s*(?:\\(([\\s\\S]*)\\))?$/.exec(s);
      if (!m) {
        throw new Error(
          "waygraph chain: could not parse segment \\"" + s + "\\" - expected \\"blockName\\" or \\"blockName({...json...})\\"",
        );
      }
      const ref = m[1];
      const json = m[2] ? m[2].trim() : undefined;
      return json ? { ref, json } : { ref };
    });
}

function seedMemForBlock(mem, resolved, json) {
  const requires = resolved.block.requires ?? [];
  if (requires.length === 0) {
    if (json !== undefined) {
      throw new Error(
        "waygraph chain: \\"" + resolved.exportName + "\\" takes no input (empty requires) but got a payload: " + json,
      );
    }
    return;
  }
  if (json === undefined) {
    throw new Error(
      "waygraph chain: \\"" + resolved.exportName + "\\" requires " + requires.map((k) => k.name).join(", ") +
        " - give a JSON payload, e.g. " + resolved.exportName + "({...})",
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error("waygraph chain: \\"" + resolved.exportName + "\\" payload is not valid JSON - " + String(err));
  }
  if (requires.length === 1) {
    mem.set(requires[0], parsed);
    return;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "waygraph chain: \\"" + resolved.exportName + "\\" requires " + requires.length + " keys (" +
        requires.map((k) => k.name).join(", ") + ") - payload must be an object keyed by each key's name",
    );
  }
  for (const k of requires) {
    if (!(k.name in parsed)) {
      throw new Error("waygraph chain: \\"" + resolved.exportName + "\\" payload is missing required key \\"" + k.name + "\\"");
    }
    mem.set(k, parsed[k.name]);
  }
}

async function main() {
  const projectDir = process.argv[2];
  const spec = process.argv[3];
  const segments = parseChainSpec(spec);
  if (segments.length === 0) {
    throw new Error("waygraph chain: empty spec - give at least one block name");
  }
  const { connect, MemPage, Engine, start, end } = await import("waygraph");
  const mem = new MemPage();
  const resolved = [];
  for (const seg of segments) {
    const r = await findBlock(projectDir, seg.ref);
    seedMemForBlock(mem, r, seg.json);
    resolved.push(r);
  }
  console.log(
    "waygraph: chaining " + resolved.map((r) => r.block.name).join(" -> ") +
      " (" + resolved.length + " block" + (resolved.length === 1 ? "" : "s") + ")",
  );
  const blocks = resolved.map((r) => r.block);
  const chained = blocks.reduce((a, b) => connect(a, b));
  const headed = process.env.WAYGRAPH_HEADED === "1";
  const slowMo = process.env.WAYGRAPH_SLOWMO ? Number(process.env.WAYGRAPH_SLOWMO) : undefined;
  const baseURL = process.env.WAYGRAPH_BASE_URL;
  const engine = new Engine({ headless: !headed, slowMo });
  const flow = engine.defineFlow([start, chained, end]);
  let result;
  if (baseURL) {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: !headed, slowMo });
    const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 720 } });
    try {
      result = await flow.run(context, mem);
    } finally {
      await browser.close();
    }
  } else {
    result = await flow.run(mem);
  }
  console.log("waygraph: chain finished -- " + JSON.stringify(result));
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});
`;

/**
 * Runs the chain runner script as a child process rooted at `projectDir` -
 * see {@link CHAIN_RUNNER_SCRIPT} for why this can't just be imported
 * in-process. `WAYGRAPH_BASE_URL` (relative `page.goto()` targets, like
 * every real zsign-all Block uses), `WAYGRAPH_HEADED=1`, and
 * `WAYGRAPH_SLOWMO=<ms>` pass straight through from this process's own env.
 */
async function runChain(projectDir: string, spec: string): Promise<void> {
  const tsxEsm = import.meta.resolve("tsx/esm");
  const scriptPath = join(projectDir, `.waygraph-chain-${process.pid}.mjs`);
  writeFileSync(scriptPath, CHAIN_RUNNER_SCRIPT);
  try {
    const code = await new Promise<number>((res, rej) => {
      const child = spawn(process.execPath, ["--import", tsxEsm, scriptPath, projectDir, spec], {
        stdio: "inherit",
        env: process.env,
      });
      child.on("error", rej);
      child.on("exit", (code) => res(code ?? 1));
    });
    if (code !== 0) {
      process.exitCode = code;
    }
  } finally {
    rmSync(scriptPath, { force: true });
  }
}

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

// ---------------------------------------------------------------------------
// `run`
// ---------------------------------------------------------------------------

async function runFlow(projectDir: string, flowName: string): Promise<void> {
  const files = discoverFlows(projectDir);
  for (const file of files) {
    let mod: Record<string, unknown>;
    try {
      mod = await importFlowFile(file);
    } catch {
      continue;
    }
    for (const [exportName, exported] of Object.entries(mod)) {
      if (!isFlowLike(exported) || exportName !== flowName) continue;
      console.log(`waygraph: running flow "${flowName}" from ${relative(projectDir, file)}`);
      const result = await exported.run(new MemPage());
      console.log(`waygraph: flow finished -- ${JSON.stringify(result)}`);
      return;
    }
  }
  console.error(`waygraph: no flow named "${flowName}" found under ${projectDir}`);
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// CLI plumbing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const command = args[0];

function usage(): void {
  console.log(`waygraph -- graph project tool + engine CLI

Usage:
  waygraph list    [project]      List discovered flows
  waygraph nav     [flow] [project]  Print flow chain + navigation steps
  waygraph validate [project]     Import and validate all flows
  waygraph run <flow> [project]   Run a named flow
  waygraph chain <spec> [project] Run one or more Blocks by name, ad hoc

    "chain" needs no .flow.ts file - reference Blocks (by their own
    runtime .name, or their export identifier) straight from the command
    line, chained with "then", each optionally given a JSON payload for
    whatever it requires:

      waygraph chain "login({\\"email\\":\\"a@b.com\\",\\"password\\":\\"x\\"}) then overview-metrics"

    A Block with no requires needs no payload. One with several required
    keys takes one JSON object keyed by each key's own name instead of a
    flat payload.

    Runs in a child process rooted at "project" (its own waygraph/playwright,
    never this CLI's) so a project's real Blocks resolve against its own
    node_modules. Env vars, all optional:
      WAYGRAPH_BASE_URL   base URL for Blocks using relative page.goto()
      WAYGRAPH_HEADED=1   show the browser instead of headless
      WAYGRAPH_SLOWMO=ms  slow down each Playwright action, for watching a run

"project" defaults to the current directory.
`);
  process.exit(0);
}

async function main(): Promise<void> {
  if (!command || command === "--help" || command === "-h") {
    usage();
  }

  switch (command) {
    case "list": {
      const proj = resolve(args[1] ?? process.cwd());
      if (!existsSync(proj)) {
        console.error(`waygraph: no such directory: ${proj}`);
        process.exit(1);
      }
      listCommand(proj);
      break;
    }

    case "nav": {
      const flowName = args[1] && args[1] !== "." ? args[1] : undefined;
      const proj = resolve(args[2] ?? process.cwd());
      navCommand(proj, flowName);
      break;
    }

    case "validate": {
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
      break;
    }

    case "run": {
      const flowName = args[1];
      if (!flowName) {
        console.error("waygraph run: missing <flow>, e.g. waygraph run LoginFlow");
        process.exit(1);
      }
      const proj = resolve(args[2] ?? process.cwd());
      await runFlow(proj, flowName);
      break;
    }

    case "chain": {
      const spec = args[1];
      if (!spec) {
        console.error('waygraph chain: missing <spec>, e.g. waygraph chain "login({...}) then overview-metrics"');
        process.exit(1);
      }
      const proj = resolve(args[2] ?? process.cwd());
      await runChain(proj, spec);
      break;
    }

    default:
      console.error(`waygraph: unknown command "${command}"`);
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
