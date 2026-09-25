#!/usr/bin/env node

/**
 * waygraph CLI -- tooling around this same package's engine.
 *
 * Primary verbs (less is more):
 *   auto   Explore picker; `.flow.ts` / `--blocks From To` = run that path
 *   demo   Watch (step overlay); `--blocks` `--data` `--auto-next` `--fast` `--full` `--mini` `--ff-expand` `--ff-disabled`
 *   run    Execute; `--blocks` `--data` `--non-headless` `--video`
 *   test   Runs the project's own @playwright/test suite; `test ui` / `--ui` = UI Mode
 *
 * Also: list / nav / validate / check / graph / init / agent-dive / traverse / try
 * Skills: --skill / --skill-pilot / --skill-pilot-blind / --skill-convention
 * Aliases (one release): `chain` -> run/demo --blocks; `--autoplay` -> `--auto-next`
 *
 * "project" defaults to cwd. Flags beat WAYGRAPH_* env.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, rmSync, cpSync, mkdirSync, mkdtempSync, statSync, type Dirent } from "node:fs";
import { resolve, relative, join, basename, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { discoverGraph, toMermaid, findOrphanBlocks, findBlockPath } from "./graph.js";
import { checkMap } from "./map-check.js";
import { runAutoExplore } from "./auto-explore-run.js";
import { pilotStart, pilotAttach } from "./pilot.js";
import {
  browserStart,
  listBrowserSessions,
  stopBrowserSession,
  stopAllBrowserSessions,
  type SessionMeta,
} from "./browser.js";
import { resolveInjectRoots } from "./block-inject.js";
import { collectPracticeWarnings, practiceKindLabel } from "./practices-check.js";
import {
  spawnDetachedSession,
  requestSession,
  runAttachLoop,
  runAutoServeCommand,
  resolveSessionMeta,
} from "./auto-session-ipc.js";
import {
  runAgentDive,
  printSkillIndex,
  readSkillMarkdown,
  SKILL_FLAG_MAP,
  type AgentDiveLoop,
  type SkillFlag,
} from "./agent-dive.js";
import { runTraverse } from "./traverse-run.js";
import { parseMinEdgeCoverage } from "./traverse-coverage.js";
import {
  isFileSelectToken,
  parseBlocksSelect,
} from "./blocks-select.js";
import { parseHighlightShorthand } from "./highlight-shorthand.js";

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
 * `chain` cannot resolve Blocks by importing them straight into THIS process: this CLI's own
 * `waygraph` (this same package) already loaded - and its engine imports `@playwright/test`.
 * A target project installs its OWN copy of both `waygraph` and `@playwright/test`, so importing
 * one of its `.block.ts` files pulls in a second, physically different Playwright - which
 * Playwright's own runtime refuses outright ("Requiring @playwright/test second time").
 *
 * The fix: never let the two copies share a process. The runner (real, typed-by-review code in
 * `src/runner/`, shipped as the `waygraph/runner` export) is started from a 2-line bootstrap
 * written into the TARGET project directory and run as its own child process, so
 * `waygraph/runner` - and therefore the engine, highlights and Playwright it uses - all resolve
 * from the target project's own install, exclusively. This CLI's own copy never loads there.
 */
const CHAIN_RUNNER_BOOTSTRAP = `let mod;
try {
  mod = await import("waygraph/runner");
} catch (err) {
  console.error(
    "waygraph: the waygraph installed in this project has no runner export (needs >= 0.15.23). " +
      "Upgrade it: npm install waygraph@latest\\n" + (err && err.message ? err.message : String(err)),
  );
  process.exit(1);
}
mod.startRunner();
`;

/**
 * Runs the chain runner script as a child process rooted at `projectDir` -
 * see {@link CHAIN_RUNNER_BOOTSTRAP} for why this can't just be imported
 * in-process. `WAYGRAPH_BASE_URL` (relative `page.goto()` targets, like
 * every real zsign-all Block uses), `WAYGRAPH_HEADED=1`, and
 * `WAYGRAPH_SLOWMO=<ms>` pass straight through from this process's own env.
 */
async function runChain(projectDir: string, spec: string): Promise<void> {
  const expanded = await expandSpecFlowFiles(projectDir, spec);
  if (process.env.WAYGRAPH_VIDEO && !process.env.WAYGRAPH_BASE_URL) {
    const resolved = resolveBaseUrl(projectDir);
    if (resolved) process.env.WAYGRAPH_BASE_URL = resolved;
  }
  const tsxEsm = import.meta.resolve("tsx/esm");
  const scriptPath = join(projectDir, `.waygraph-chain-${process.pid}.mjs`);
  writeFileSync(scriptPath, CHAIN_RUNNER_BOOTSTRAP);
  try {
    const code = await new Promise<number>((res, rej) => {
      const child = spawn(process.execPath, ["--import", tsxEsm, scriptPath, projectDir, expanded], {
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
// `try` - a bundled, self-contained showcase. No .flow.ts to write, no
// scenario to design - copies a small real Flow (nav/action Blocks, Trait
// verify, narrate()) into the target project and runs it in step mode
// against a public demo site, so a curious dev sees the real overlay/panel
// experience in under a minute, then gets pointed at the plain waygraph
// source that produced it.
// ---------------------------------------------------------------------------

/** This package's own installed root - dist/cli.js -> .. */
function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

interface TryPrereqStatus {
  ok: boolean;
  missing?: "waygraph" | "playwright-test" | "browser" | "unknown";
  detail?: string;
}

/**
 * Runs a throwaway probe script rooted at `projectDir` - the exact same
 * directory the real demo files get copied into, so it resolves "waygraph"
 * and "@playwright/test" exactly as they will - and actually launches (then
 * immediately closes) chromium, a real check rather than a guess at whether
 * the browser's installed. Never leaves the probe script behind.
 */
async function probeTryPrereqs(projectDir: string): Promise<TryPrereqStatus> {
  const tsxEsm = import.meta.resolve("tsx/esm");
  const probeScript = [
    "try {",
    '  await import("waygraph");',
    "} catch {",
    '  console.error("WAYGRAPH_TRY_MISSING_WAYGRAPH");',
    "  process.exit(1);",
    "}",
    "let mod;",
    "try {",
    '  mod = await import("@playwright/test");',
    "} catch {",
    '  console.error("WAYGRAPH_TRY_MISSING_PLAYWRIGHT_TEST");',
    "  process.exit(1);",
    "}",
    "try {",
    "  const browser = await mod.chromium.launch({ headless: true });",
    "  await browser.close();",
    "} catch (err) {",
    "  if (String(err && err.message).includes(\"Executable doesn't exist\")) {",
    '    console.error("WAYGRAPH_TRY_MISSING_BROWSER");',
    "    process.exit(1);",
    "  }",
    "  console.error(String((err && err.stack) || err));",
    "  process.exit(1);",
    "}",
  ].join("\n");
  const probePath = join(projectDir, `.waygraph-try-probe-${process.pid}.mjs`);
  writeFileSync(probePath, probeScript);
  try {
    const result = await new Promise<{ code: number; stderr: string }>((res, rej) => {
      const child = spawn(process.execPath, ["--import", tsxEsm, probePath], {
        cwd: projectDir,
        stdio: ["ignore", "ignore", "pipe"],
        env: process.env,
      });
      let stderrBuf = "";
      child.stderr?.on("data", (d) => { stderrBuf += d.toString(); });
      child.on("error", rej);
      child.on("exit", (code) => res({ code: code ?? 1, stderr: stderrBuf }));
    });
    if (result.code === 0) return { ok: true };
    const stderr = result.stderr;
    if (stderr.includes("WAYGRAPH_TRY_MISSING_WAYGRAPH")) return { ok: false, missing: "waygraph" };
    if (stderr.includes("WAYGRAPH_TRY_MISSING_PLAYWRIGHT_TEST")) return { ok: false, missing: "playwright-test" };
    if (stderr.includes("WAYGRAPH_TRY_MISSING_BROWSER")) return { ok: false, missing: "browser" };
    return { ok: false, missing: "unknown", detail: stderr.trim() || `probe exited with code ${result.code}` };
  } finally {
    rmSync(probePath, { force: true });
  }
}

/** Spawns with inherited stdio (the real npm/playwright output, visible) and resolves to its exit code. */
function runInherited(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit", env: process.env });
    child.on("error", rej);
    child.on("exit", (code) => res(code ?? 1));
  });
}

/** Installs deps + chromium inside an already-copied quickstart folder. */
async function ensureDirPrereqs(dir: string, label: string): Promise<string | null> {
  let status = await probeTryPrereqs(dir);
  if (status.ok) return null;

  if (!existsSync(join(dir, "package.json"))) {
    return `${label}: no package.json in ${dir}`;
  }

  if (status.missing === "waygraph" || status.missing === "playwright-test" || status.missing === "unknown") {
    // Copied quickstart must not keep a workspace-tainted lockfile (breaks temp-dir npm install).
    rmSync(join(dir, "package-lock.json"), { force: true });
    console.log(`${label}: installing dependencies in ${dir} ...`);
    const installCode = await runInherited("npm", ["install"], dir);
    if (installCode !== 0) {
      return `npm install exited with code ${installCode} - see the output above.`;
    }
    status = await probeTryPrereqs(dir);
    if (status.ok) return null;
    if (status.missing === "unknown") {
      return formatProbeFailure(status.detail ?? "probe failed");
    }
  }

  console.log(`${label}: downloading Playwright's chromium browser ...`);
  const localPlaywrightBin = join(dir, "node_modules", ".bin", "playwright");
  const browserCode = existsSync(localPlaywrightBin)
    ? await runInherited(localPlaywrightBin, ["install", "chromium"], dir)
    : await runInherited("npx", ["--yes", "playwright", "install", "chromium"], dir);
  if (browserCode !== 0) {
    return `"playwright install chromium" exited with code ${browserCode} - see the output above.`;
  }
  status = await probeTryPrereqs(dir);
  if (status.ok) return null;
  return formatProbeFailure(
    status.detail ?? "prerequisites still aren't ready after attempting to install them.",
  );
}

/** Playwright browser binary present but OS libs missing (common in Docker/Codespaces). */
function formatProbeFailure(detail: string): string {
  const needsDeps =
    /shared libraries|libnspr4|libnss3|libatk|cannot open shared object file/i.test(detail);
  const hint = needsDeps
    ? "\n\nChromium needs OS packages too - try:\n  sudo npx playwright install-deps chromium\n" +
      "In cloud/CI without a display, record headless:\n  npx waygraph try demo --video ./out --no-step"
    : "";
  return `couldn't verify prerequisites:\n${detail}${hint}`;
}

const TRY_DEMO_CHAIN =
  'loginFlow({"saucedemo.credentials":{"username":"standard_user","password":"secret_sauce"}}) then ' +
  'shopFlow({"saucedemo.selectedItem":{"id":"sauce-labs-backpack","name":"Sauce Labs Backpack"}}) then ' +
  'viewerBlockedFlow({"saucedemo.credentials":{"username":"locked_out_user","password":"secret_sauce"}})';

/**
 * Point a copied quickstart at this checkout's waygraph build (not npm registry).
 * Uses `npm pack` into destDir - a file: symlink to the dev tree can double-load
 * @playwright/test when sibling projects also install Playwright.
 */
async function wireQuickstartToPackageRoot(destDir: string): Promise<void> {
  const root = packageRoot();
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version as string;
  const packCode = await runInherited("npm", ["pack", "--pack-destination", destDir, "--silent"], root);
  if (packCode !== 0) {
    throw new Error(`waygraph try demo: npm pack failed with exit code ${packCode}`);
  }
  const tgz = join(destDir, `waygraph-${version}.tgz`);
  const pkgPath = join(destDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  if (!pkg.dependencies) pkg.dependencies = {};
  pkg.dependencies.waygraph = `file:${tgz}`;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

/**
 * Copy templates/quickstart into a fresh OS temp dir and wire it to this
 * package build. Returns destDir, or null after setting exitCode on failure.
 */
async function prepareTryQuickstart(label: string): Promise<string | null> {
  const destDir = mkdtempSync(join(tmpdir(), `${label}-`));
  cpSync(join(packageRoot(), "templates", "quickstart"), destDir, { recursive: true });
  rmSync(join(destDir, "node_modules"), { recursive: true, force: true });
  rmSync(join(destDir, "test-results"), { recursive: true, force: true });
  rmSync(join(destDir, "package-lock.json"), { force: true });
  try {
    await wireQuickstartToPackageRoot(destDir);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return null;
  }
  const problem = await ensureDirPrereqs(destDir, label);
  if (problem) {
    console.error(`${label}: couldn't get ready.\n${problem}`);
    process.exitCode = 1;
    return null;
  }
  return destDir;
}

/**
 * `waygraph try demo` - copy a self-contained saucedemo project into a temp
 * dir (never the caller's cwd), run a chainFlow step demo (Sign In + Shop +
 * blocked Viewer), then run the headless Playwright test, and print where
 * everything lives.
 */
async function runTryDemo(): Promise<void> {
  const destDir = await prepareTryQuickstart("waygraph-try-demo");
  if (!destDir) return;

  process.env.WAYGRAPH_BASE_URL ??= "https://www.saucedemo.com";
  process.env.WAYGRAPH_STEP ??= "1";
  process.env.WAYGRAPH_AUTOPLAY ??= "0";
  // Explicit --no-step --video = unattended headless .webm only (the
  // documented cloud/CI recipe above) - nobody needs to watch a live
  // window for Playwright's own recordVideo to capture the right thing.
  // This must be decided BEFORE the headed default below, or the
  // unconditional "??=" there always wins and the documented recipe never
  // actually runs headless.
  const unattendedVideo = Boolean(process.env.WAYGRAPH_VIDEO) && process.env.WAYGRAPH_STEP === "0";
  if (unattendedVideo) {
    process.env.WAYGRAPH_AUTOPLAY ??= "1";
    process.env.WAYGRAPH_HEADED ??= "0";
  } else {
    // Default: headed stepper, manual Next. --video records that session
    // too (not a headless rush) as long as --step is still on.
    process.env.WAYGRAPH_HEADED ??= "1";
  }

  const videoTo = process.env.WAYGRAPH_VIDEO;
  console.log(
    videoTo
      ? "waygraph try demo: step-through + record (Sign In -> Shop & Checkout -> blocked Viewer login) - click Next; video -> " +
          (videoTo === "1" ? ".waygraph-videos/" : videoTo)
      : "waygraph try demo: step-through (Sign In -> Shop & Checkout -> blocked Viewer login) - click Next for each step ...",
  );
  await runChain(destDir, TRY_DEMO_CHAIN);
  if (process.exitCode) return;

  console.log("\nwaygraph try demo: running headless chainFlow test ...");
  const testCode = await runInherited("npm", ["test"], destDir);
  if (testCode !== 0) {
    process.exitCode = testCode;
    return;
  }

  const testFile = join(destDir, "tests", "chain-flow.spec.ts");
  const loginFlowFile = join(destDir, "src", "flows", "login.flow.ts");
  const shopFlowFile = join(destDir, "src", "flows", "shop.flow.ts");
  const viewerBlockedFlowFile = join(destDir, "src", "flows", "viewer-blocked.flow.ts");

  console.log(
    "\nwaygraph try demo: done.\n\n" +
      "Temp project (does not touch your cwd - lives under the OS temp dir):\n" +
      `  ${destDir}\n\n` +
      "Episodes you just watched (same Flow objects the test imports):\n" +
      `  ${loginFlowFile}\n` +
      `  ${shopFlowFile}\n` +
      `  ${viewerBlockedFlowFile}\n\n` +
      "Headless chainFlow test (automated - no clicking):\n" +
      `  ${testFile}\n\n` +
      "Run again in that temp folder:\n" +
      `  cd ${destDir}\n` +
      "  npm run demo    # step-through, manual Next (--step --no-autoplay)\n" +
      "  npm run auto    # interactive explore (Effect Add/Remove, MemNav Open details)\n" +
      "  npm test        # playwright chainFlow test\n\n" +
      "Permanent full example in this package: examples/saucedemo\n" +
      "Keep a permanent scaffold in your tree: waygraph init my-app\n",
  );
}

const TRY_AUTO_DATA =
  '{"saucedemo.credentials":{"username":"standard_user","password":"secret_sauce"}}';

/**
 * `waygraph try auto` / `try auto:cli` - temp Sauce Demo explore.
 * Default is the **headed** browser panel. Pass `auto:cli` or `--cli` for the
 * terminal menu (same rows).
 *
 * Runs as a child in the temp project so Block imports share that install's
 * `@playwright/test`. In-process explore from the outer CLI against a packed
 * `file:*.tgz` copy double-loads Playwright and silently yields 0 graph edges
 * ("LoginPage / No moves").
 */
async function runTryAuto(opts: { cli: boolean } = { cli: false }): Promise<void> {
  const destDir = await prepareTryQuickstart("waygraph-try-auto");
  if (!destDir) return;

  process.env.WAYGRAPH_BASE_URL ??= "https://www.saucedemo.com";
  const cli = opts.cli === true;
  console.log(
    cli
      ? "waygraph try auto: CLI explore on Sauce Demo (temp dir).\n" +
          "  Creds pre-seeded (saucedemo.credentials).\n" +
          "  Pick [1] submit-login, then inventory Add/Remove / Open details.\n" +
          "  Type q to quit. Headed panel: waygraph try auto\n"
      : "waygraph try auto: headed explore on Sauce Demo (temp dir).\n" +
          "  Creds pre-seeded. CLI menu: waygraph try auto:cli\n" +
          "  Pick submit-login, then inventory menus. Quit from the panel.\n",
  );

  const bin = join(destDir, "node_modules", ".bin", "waygraph");
  const args = ["auto"];
  if (cli) args.push("--cli");
  args.push("--data", TRY_AUTO_DATA);
  const code = await runInherited(bin, args, destDir);
  if (code !== 0) process.exitCode = code;

  console.log(
    "\nwaygraph try auto: explorer closed.\n\n" +
      `Temp project:\n  ${destDir}\n\n` +
      "Run again:\n" +
      `  cd ${destDir} && npm run auto\n` +
      `  cd ${destDir} && npm run auto:cli\n\n` +
      "In-package: examples/saucedemo\n" +
      "Docs: https://deviate-dv8.github.io/waygraph/auto.html\n",
  );
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
// `check` - secondary/complementary to the ActionPage @deprecated warning
// (src/types.ts). That's the primary, always-on signal an editor shows the
// instant a regular Block's act() calls a navigation method; this command
// sweeps a whole project in one shot for contexts with no editor watching
// (CI, an autonomous agent writing Block files without a language server).
// See openspec/specs/nav-block-and-check/spec.md for the full rationale.
// ---------------------------------------------------------------------------

function discoverBlocks(projectDir: string): string[] {
  return walkDir(projectDir, /\.block\.ts$/);
}

function isBlockLike(val: unknown): val is { name: string; instruction: { act: unknown } } {
  if (val === null || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  if (typeof obj.name !== "string") return false;
  const instruction = obj.instruction as Record<string, unknown> | undefined;
  return instruction !== null && typeof instruction === "object" && typeof instruction?.act === "function";
}

/** Set by `defineNavBlock` (non-enumerable) - see src/engine.ts. */
function isNavBlockMarked(val: Record<string, unknown>): boolean {
  return (val as { __waygraphKind?: string }).__waygraphKind === "nav";
}

const NAV_METHOD_CALLS = ["page.goto(", "page.reload(", "page.goBack(", "page.goForward("] as const;

/**
 * Matches a selector-taking Trait factory call whose first argument is a
 * literal string/template, not an identifier or property access - the exact
 * shape found repeatedly in hand-written assertion Blocks
 * (`Trait.visible("#some-id")` instead of `Trait.visible(SomeSel.thing)`).
 * `Trait.url(...)` is deliberately excluded - it takes a URLPatternInit, never
 * a DOM selector. Same file-scoped-regex bluntness the nav-escape sweep above
 * already accepts (see openspec/specs/nav-block-and-check/spec.md) - a known
 * blind spot on string concatenation/template-built selectors, not solved
 * here for the same "recipe before promotion" reason that check accepts its
 * own shared-helper blind spot.
 */
const INLINE_SELECTOR_CALL = /\b(?:Trait\.visible|Trait\.text|textEquals|visible)\(\s*["'`]/;

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

async function runChainAuto(projectDir: string, fromTag: string, toTag: string): Promise<void> {
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

function initCommand(projectName: string): void {
  if (!projectName) {
    console.error("waygraph init: missing <project-name>, e.g. waygraph init my-app");
    process.exit(1);
  }
  const targetDir = resolve(process.cwd(), projectName);
  const pkgName = basename(targetDir);
  if (existsSync(targetDir)) {
    const entries = readdirSync(targetDir);
    if (entries.length > 0) {
      console.error(`waygraph init: "${targetDir}" already exists and is not empty`);
      process.exit(1);
    }
  } else {
    mkdirSync(targetDir, { recursive: true });
  }
  const templateDir = join(packageRoot(), "templates", "scaffold");
  if (!existsSync(templateDir)) {
    console.error(`waygraph init: scaffold template missing at ${templateDir}`);
    process.exit(1);
  }
  cpSync(templateDir, targetDir, { recursive: true });
  const gitignoreSrc = join(targetDir, "gitignore");
  if (existsSync(gitignoreSrc)) {
    writeFileSync(join(targetDir, ".gitignore"), readFileSync(gitignoreSrc, "utf-8"));
    rmSync(gitignoreSrc);
  }
  const packageJsonPath = join(targetDir, "package.json");
  writeFileSync(
    packageJsonPath,
    readFileSync(packageJsonPath, "utf-8").replaceAll("__PROJECT_NAME__", pkgName),
  );
  console.log(`Scaffolded ${pkgName}/`);
  console.log("");
  console.log(`  cd ${relative(process.cwd(), targetDir) || pkgName}`);
  console.log("  npm install");
  console.log("  npx playwright install chromium");
  console.log("  npm test");
  console.log("  waygraph list        # .flow.ts → export map");
  console.log("  waygraph check       # nav hygiene + inline selectors + bad practices + orphan Blocks");
  console.log("  waygraph typecheck   # tsc --noEmit + bad-practice warnings (use --no-practices to skip)");
  console.log("  waygraph auto        # interactive explore (headed panel)");
  console.log("  waygraph auto --cli  # same menus in the terminal");
  console.log("  waygraph demo --blocks exampleFlow");
  console.log("  waygraph graph       # static state graph JSON");
  console.log("");
  console.log("  Layout: see STRUCTURE.md (or https://deviate-dv8.github.io/waygraph/scaffold.html)");
}

function printPracticeReport(
  projectDir: string,
  practiceWarnings: import("./practices-check.js").PracticeWarning[],
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
  practiceWarnings: import("./practices-check.js").PracticeWarning[];
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

// ---------------------------------------------------------------------------
// CLI plumbing - run flags (flags beat WAYGRAPH_* env)
// ---------------------------------------------------------------------------

interface RunFlags {
  step?: boolean;
  autoplay?: boolean;
  /** demo only: --auto-next + --video (+ step). */
  autoPlayVideo?: boolean;
  /** run/demo: show browser (WAYGRAPH_HEADED=1). */
  nonHeadless?: boolean;
  baseUrl?: string;
  title?: string;
  /** Set when --video present; empty string = default dir under project. */
  video?: string;
  /** Recording viewport, e.g. 1920x1080 (--video-viewport). */
  videoViewport?: string;
  /** Global Mem seed JSON (--data). */
  data?: string;
  /** Fill any requires key with no --data coverage from registerMemStub's registry (--mem-stub). */
  memStub?: boolean;
  /** Flow/chain spec from --blocks <spec>. */
  blocks?: string;
  /** auto path-find: --blocks <fromCheckpoint> <toCheckpoint>. */
  blocksFromTo?: [string, string];
  cli?: boolean;
  /** auto --cli --detach: run the explore session as a background socket server. */
  detach?: boolean;
  /** Force headed panel (compat; bare try auto / auto already headed). */
  headed?: boolean;
  mermaid?: boolean;
  map?: boolean;
  /** demo: faster transitions / shorter auto-next gates. */
  fast?: boolean;
  /** demo: classic wrap-all block chips instead of carousel. */
  fullStepper?: boolean;
  /** demo: force compact mini panel (--mini / WAYGRAPH_MINI=1). */
  miniStepper?: boolean;
  /** demo: floating todo dock side (--todo-left | --todo-right). */
  todoPos?: "left" | "right";
  /** demo: todo-dock UX — full list / no smart behaviors. */
  todoUiFull?: boolean;
  /** demo: todo-dock UX — smart compact/collision/behind (default). */
  todoUiSmart?: boolean;
  /** demo/run: expand fastForwardComposeBlock inners as separate steps. */
  ffExpand?: boolean;
  /** demo/run: dispute mode — expand FF + keep blitz on former FF inners. */
  ffDisabled?: boolean;
  /** Positional args with run flags stripped. */
  positionals: string[];
  /** browser/pilot: merge Block trees from preset names or paths (repeatable). */
  inject?: string[];
  /** browser/pilot: navigate on start (disables blank page). */
  goto?: string;
  /** browser/pilot: force about:blank on start. */
  blank?: boolean;
  /** browser/pilot: headless session (default visible for browser). */
  headlessBrowser?: boolean;
  /** browser/pilot sessions: machine-readable JSON. */
  json?: boolean;
  /** check/typecheck: skip bad-practice warnings. */
  noPractices?: boolean;
}

function takeFlagValue(argv: string[], i: number, a: string, flag: string): { value: string; nextI: number } {
  if (a.startsWith(flag + "=")) {
    return { value: a.slice(flag.length + 1), nextI: i };
  }
  const v = argv[i + 1];
  if (v === undefined || (v.startsWith("-") && !a.includes("="))) {
    console.error(`waygraph: ${flag} needs a value`);
    process.exit(1);
  }
  return { value: v, nextI: i + 1 };
}

/**
 * Looks like a Checkpoint tag for auto --blocks From To (PascalCase).
 * Kebab-case Block names must not trigger path-find mode.
 */
function looksLikeCheckpointArg(s: string): boolean {
  if (!s || s.startsWith("-")) return false;
  if (s.includes("then") || s.includes("(") || s.includes("{") || s.includes("/")) return false;
  if (s === "." || s.includes(".")) return false;
  return /^[A-Z][A-Za-z0-9_]*$/.test(s);
}

/**
 * Pulls run/demo/auto flags out of argv. Unknown bare `--*` that are not
 * recognized stay as positionals only when they are project paths; known
 * explore flags (--cli/--mermaid/--map) are parsed here.
 */
function parseRunFlags(argv: string[]): RunFlags {
  const out: RunFlags = { positionals: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--step") {
      out.step = true;
    } else if (a === "--no-step") {
      out.step = false;
    } else if (a === "--auto-next" || a === "--autoplay") {
      out.autoplay = true;
    } else if (a === "--no-auto-next" || a === "--no-autoplay") {
      out.autoplay = false;
    } else if (a === "--auto-play-video") {
      out.autoPlayVideo = true;
    } else if (a === "--auto-play-video-head") {
      out.autoPlayVideo = true;
      out.nonHeadless = true;
    } else if (a === "--fast") {
      out.fast = true;
    } else if (a === "--full") {
      out.fullStepper = true;
    } else if (a === "--mini" || a === "--stepper-mini") {
      out.miniStepper = true;
    } else if (a === "--todo-left") {
      out.todoPos = "left";
    } else if (a === "--todo-right") {
      out.todoPos = "right";
    } else if (a === "--todo-full" || a === "--no-todo-smart") {
      out.todoUiFull = true;
    } else if (a === "--todo-smart") {
      out.todoUiSmart = true;
    } else if (a === "--ff-expand") {
      out.ffExpand = true;
    } else if (a === "--ff-disabled" || a === "--no-ff") {
      out.ffDisabled = true;
      out.ffExpand = true;
    } else if (a === "--non-headless") {
      out.nonHeadless = true;
    } else if (a === "--headless") {
      out.headlessBrowser = true;
    } else if (a === "--json") {
      out.json = true;
    } else if (a === "--no-practices") {
      out.noPractices = true;
    } else if (a === "--blank") {
      out.blank = true;
    } else if (a === "--goto" || a.startsWith("--goto=")) {
      const t = takeFlagValue(argv, i, a, "--goto");
      out.goto = t.value;
      i = t.nextI;
    } else if (a === "--inject" || a.startsWith("--inject=")) {
      const t = takeFlagValue(argv, i, a, "--inject");
      out.inject ??= [];
      out.inject.push(t.value);
      i = t.nextI;
    } else if (a === "--cli") {
      out.cli = true;
    } else if (a === "--detach") {
      out.detach = true;
    } else if (a === "--headed") {
      out.headed = true;
    } else if (a === "--mermaid") {
      out.mermaid = true;
    } else if (a === "--map") {
      out.map = true;
    } else if (a === "--base-url" || a.startsWith("--base-url=")) {
      const t = takeFlagValue(argv, i, a, "--base-url");
      out.baseUrl = t.value;
      i = t.nextI;
    } else if (a === "--title" || a.startsWith("--title=")) {
      const t = takeFlagValue(argv, i, a, "--title");
      out.title = t.value;
      i = t.nextI;
    } else if (a === "--data" || a.startsWith("--data=")) {
      const t = takeFlagValue(argv, i, a, "--data");
      out.data = t.value;
      i = t.nextI;
    } else if (a === "--mem-stub") {
      out.memStub = true;
    } else if (a === "--video" || a.startsWith("--video=")) {
      if (a.startsWith("--video=")) {
        out.video = a.slice("--video=".length);
      } else {
        const v = argv[i + 1];
        if (v === undefined || v.startsWith("-")) {
          out.video = "";
        } else {
          out.video = v;
          i++;
        }
      }
    } else if (a === "--video-viewport" || a.startsWith("--video-viewport=")) {
      const t = takeFlagValue(argv, i, a, "--video-viewport");
      out.videoViewport = t.value;
      i = t.nextI;
    } else if (a === "--blocks" || a.startsWith("--blocks=")) {
      if (a.startsWith("--blocks=")) {
        out.blocks = a.slice("--blocks=".length);
      } else {
        const v1 = argv[++i];
        if (!v1 || v1.startsWith("-")) {
          console.error("waygraph: --blocks needs a flow/spec or <from> <to> checkpoints");
          process.exit(1);
        }
        const v2 = argv[i + 1];
        if (v2 && looksLikeCheckpointArg(v1) && looksLikeCheckpointArg(v2)) {
          out.blocksFromTo = [v1, v2];
          i++;
        } else {
          out.blocks = v1;
        }
      }
    } else {
      out.positionals.push(a);
    }
  }
  return out;
}

/** Parses WAYGRAPH_VIDEO_VIEWPORT / --video-viewport: "1920x1080" or "1920,1080". */
function parseVideoViewportFlag(raw: string | undefined): { width: number; height: number } | null {
  if (!raw?.trim()) return null;
  const m = raw.trim().match(/^(\d{3,5})[xX,](\d{3,5})$/);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < 320 || height < 240 || width > 7680 || height > 4320) return null;
  return { width, height };
}

/** Writes flag values into process.env so the chain child inherits them. Flags beat prior env. */
function applyRunFlags(flags: RunFlags, opts?: { allowAutoPlayVideo?: boolean; allowDemoUi?: boolean }): void {
  if (flags.autoPlayVideo) {
    if (!opts?.allowAutoPlayVideo) {
      console.error("waygraph: --auto-play-video is a demo-only flag (QA watch + record)");
      process.exit(1);
    }
    if (flags.autoplay === undefined) flags.autoplay = true;
    if (flags.video === undefined) flags.video = "";
    // Overlay narration (captions/rings/slides) needs step mode to run, but
    // --auto-play-video is unattended-and-recorded by design - no human
    // has to watch a live window for Playwright's own recordVideo to
    // capture the right thing. Headless by default; --non-headless (or the
    // --auto-play-video-head alias, parsed above) opts back into a
    // visible browser for someone who wants to watch it live too.
    process.env.WAYGRAPH_STEP = "1";
    if (!flags.nonHeadless && process.env.WAYGRAPH_HEADED === undefined) {
      process.env.WAYGRAPH_HEADED = "0";
    }
  }
  if (
    (flags.fast || flags.fullStepper || flags.miniStepper || flags.todoPos || flags.todoUiFull || flags.todoUiSmart) &&
    !opts?.allowDemoUi
  ) {
    console.error(
      "waygraph: --fast / --full / --mini / --todo-left|--todo-right / --todo-full|--todo-smart are demo-only flags",
    );
    process.exit(1);
  }
  if (flags.step === true) {
    process.env.WAYGRAPH_STEP = "1";
    process.env.WAYGRAPH_HEADED = "1";
  } else if (flags.step === false) {
    process.env.WAYGRAPH_STEP = "0";
  }
  if (flags.autoplay === true) {
    process.env.WAYGRAPH_AUTOPLAY = "1";
  } else if (flags.autoplay === false) {
    process.env.WAYGRAPH_AUTOPLAY = "0";
  }
  if (flags.nonHeadless) {
    process.env.WAYGRAPH_HEADED = "1";
  }
  // Any --video on demo/run: headless unless --non-headless already won.
  if (flags.video !== undefined && !flags.nonHeadless && process.env.WAYGRAPH_HEADED === undefined) {
    process.env.WAYGRAPH_HEADED = "0";
  }
  if (flags.baseUrl !== undefined) {
    process.env.WAYGRAPH_BASE_URL = flags.baseUrl;
  }
  if (flags.title !== undefined) {
    process.env.WAYGRAPH_TITLE = flags.title;
  }
  if (flags.video !== undefined) {
    process.env.WAYGRAPH_VIDEO = flags.video || "1";
  }
  if (flags.videoViewport !== undefined) {
    if (!parseVideoViewportFlag(flags.videoViewport)) {
      console.error('waygraph: --video-viewport must look like "1920x1080"');
      process.exit(1);
    }
    process.env.WAYGRAPH_VIDEO_VIEWPORT = flags.videoViewport;
  }
  if (flags.data !== undefined) {
    process.env.WAYGRAPH_DATA = flags.data;
  }
  if (flags.memStub) {
    process.env.WAYGRAPH_MEM_STUB = "1";
  }
  if (flags.fast) {
    process.env.WAYGRAPH_DEMO_FAST = "1";
  }
  if (flags.fullStepper) {
    process.env.WAYGRAPH_STEPPER = "full";
  }
  if (flags.miniStepper) {
    process.env.WAYGRAPH_MINI = "1";
  }
  if (flags.todoPos === "left" || flags.todoPos === "right") {
    process.env.WAYGRAPH_TODO_POS = flags.todoPos;
  }
  if (flags.todoUiFull) {
    process.env.WAYGRAPH_TODO_UI = "full";
  } else if (flags.todoUiSmart) {
    process.env.WAYGRAPH_TODO_UI = "smart";
  }
  if (flags.ffExpand) {
    process.env.WAYGRAPH_FF_EXPAND = "1";
  }
  if (flags.ffDisabled) {
    process.env.WAYGRAPH_FF_DISABLED = "1";
    process.env.WAYGRAPH_FF_EXPAND = "1";
  }
}

/**
 * BASE_URL when neither --base-url nor WAYGRAPH_BASE_URL is set:
 * package.json `waygraph.baseUrl` (or `baseURL`), then playwright.config `baseURL`.
 */
function resolveBaseUrl(projectDir: string): string | undefined {
  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        waygraph?: { baseUrl?: string; baseURL?: string };
        config?: { waygraph?: { baseUrl?: string; baseURL?: string } };
      };
      const fromPkg =
        pkg.waygraph?.baseUrl ??
        pkg.waygraph?.baseURL ??
        pkg.config?.waygraph?.baseUrl ??
        pkg.config?.waygraph?.baseURL;
      if (typeof fromPkg === "string" && fromPkg.trim()) return fromPkg.trim();
    } catch {
      // ignore malformed package.json - fall through to playwright
    }
  }
  for (const name of ["playwright.config.ts", "playwright.config.mts", "playwright.config.js", "playwright.config.mjs"]) {
    const p = join(projectDir, name);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, "utf-8");
    const m = src.match(/baseURL\s*:\s*["']([^"']+)["']/);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

/**
 * Friendly demo defaults: STEP on; headed only for live watch (no --video).
 * --video / --auto-play-video => headless unless --non-headless.
 * Call after applyRunFlags so explicit flags already won.
 */
function applyDemoDefaults(projectDir: string): void {
  if (process.env.WAYGRAPH_STEP === undefined) process.env.WAYGRAPH_STEP = "1";
  if (process.env.WAYGRAPH_STEP === "1" && process.env.WAYGRAPH_HEADED === undefined) {
    // Recording locks headless - a live window fights fixed video viewport /
    // device shell centering. Watch live only with --non-headless.
    process.env.WAYGRAPH_HEADED = process.env.WAYGRAPH_VIDEO ? "0" : "1";
  }
  // Manual Next by default. --auto-next / --auto-play-video flip this.
  if (process.env.WAYGRAPH_AUTOPLAY === undefined) {
    if (process.env.WAYGRAPH_VIDEO && process.env.WAYGRAPH_STEP === "0") {
      process.env.WAYGRAPH_AUTOPLAY = "1";
    } else {
      process.env.WAYGRAPH_AUTOPLAY = "0";
    }
  }
  if (!process.env.WAYGRAPH_BASE_URL) {
    const resolved = resolveBaseUrl(projectDir);
    if (resolved) process.env.WAYGRAPH_BASE_URL = resolved;
  }
}

function resolveProjectDir(flags: RunFlags, fallbackIndex = 0): string {
  const cand = flags.positionals[fallbackIndex] ?? process.cwd();
  return resolve(cand);
}

function resolveSpec(flags: RunFlags): string | undefined {
  return flags.blocks ?? flags.positionals[0];
}

/** `shop.flow.ts` / `src/flows/cart-bulk.flow.ts` / absolute path — not a Checkpoint or export id. */
function looksLikeFlowFileRef(ref: string): boolean {
  if (!ref || ref.includes("then") || ref.includes("(")) return false;
  return /\.flow\.ts$/i.test(ref) || (/\.ts$/i.test(ref) && (ref.includes("/") || ref.includes("\\")));
}

function flowExportNameFromBasename(filePath: string): string {
  const base = basename(filePath).replace(/\.flow\.ts$/i, "").replace(/\.ts$/i, "");
  const camel = base.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  return /Flow$/i.test(camel) ? camel : `${camel}Flow`;
}

/**
 * Map a `.flow.ts` path (relative to project or absolute) to its Flow export
 * name so the chain runner can `findFlow(exportName)`. Prefers
 * `shop.flow.ts` → `shopFlow`. Reads source only (no import) so the outer CLI
 * does not dual-load `@playwright/test` against the project tree.
 */
async function resolveFlowFileToExport(projectDir: string, fileArg: string): Promise<string> {
  let abs = resolve(projectDir, fileArg);
  if (!existsSync(abs)) {
    const want = basename(fileArg);
    const hits = walkDir(projectDir, new RegExp(`${want.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    if (hits.length === 1) abs = hits[0]!;
    else if (hits.length === 0) {
      throw new Error(`waygraph: no flow file "${fileArg}" under ${projectDir}`);
    } else {
      throw new Error(
        `waygraph: "${fileArg}" matches ${hits.length} files - use a path from \`waygraph list\``,
      );
    }
  }
  const expected = flowExportNameFromBasename(abs);
  const src = readFileSync(abs, "utf-8");
  if (new RegExp(`\\bexport\\s+(?:const|let|var|async\\s+function|function)\\s+${expected}\\b`).test(src)) {
    return expected;
  }
  if (new RegExp(`\\bexport\\s*\\{[^}]*\\b${expected}\\b`).test(src)) {
    return expected;
  }
  const flowNames = [
    ...src.matchAll(/\bexport\s+(?:const|let|var|async\s+function|function)\s+(\w*Flow)\b/g),
  ].map((m) => m[1]!);
  const unique = [...new Set(flowNames)];
  if (unique.length === 1) return unique[0]!;
  if (unique.includes(expected)) return expected;
  if (unique.length === 0) {
    throw new Error(
      `waygraph: ${relative(projectDir, abs)} has no exported *Flow (expected ${expected})`,
    );
  }
  throw new Error(
    `waygraph: ${relative(projectDir, abs)} exports ${unique.join(", ")} - pass the export name or rename to ${expected}`,
  );
}

/**
 * Expand `.flow.ts` path segments in a run/demo spec to export names.
 * `src/flows/shop.flow.ts` → `shopFlow`; leaves `loginFlow then nav-cart` alone.
 */
async function expandSpecFlowFiles(projectDir: string, spec: string): Promise<string> {
  const parts = spec.split(/\bthen\b/).map((s) => s.trim()).filter((s) => s.length > 0);
  const out: string[] = [];
  for (const part of parts) {
    const m = /^([^\s(]+)(\s*\([\s\S]*\))?$/.exec(part);
    if (!m) {
      out.push(part);
      continue;
    }
    const ref = m[1]!;
    const payload = m[2] ?? "";
    if (looksLikeFlowFileRef(ref)) {
      const exportName = await resolveFlowFileToExport(projectDir, ref);
      out.push(exportName + payload);
    } else {
      out.push(part);
    }
  }
  return out.join(" then ");
}

const args = process.argv.slice(2);
const command = args[0];

function printBrowserUsage(): void {
  console.log(`waygraph browser — persistent Playwright sessions (headful by default)

  waygraph browser start [--inject preset|path] [--goto <url>] [--blank] [--headless] [--cli] [project]
                           Open a new session (about:blank by default)
  waygraph browser sessions [--json] [project]
                           List live sessions for a project
  waygraph browser stop <sessionId|--all> [project]
  waygraph browser attach <sessionId>       Terminal picker on a live session

  waygraph browser status <sessionId>       Current menu (no side effects)
  waygraph browser send <sessionId> "<pick>"
  waygraph browser reach <sessionId> <Checkpoint>
  waygraph browser dom|trace|console|storage|highlight <sessionId> …
  waygraph browser click|type|press|goto|upload|reload|resync <sessionId> …

  auto send|status|… and pilot send|status|… use the same session ids.`);
}

function printBrowserSessionsList(sessions: SessionMeta[], projectDir: string): void {
  if (sessions.length === 0) {
    console.log(`No live browser sessions for ${projectDir}.`);
    console.log("  waygraph browser start");
    return;
  }
  console.log(`Live browser sessions (${projectDir}):`);
  for (const s of sessions) {
    const mode = s.headless ? "headless" : "headful";
    console.log(`  ${s.sessionId}  ${mode}  pid ${s.pid}`);
    console.log(`    waygraph browser attach ${s.sessionId}`);
    console.log(`    waygraph browser stop ${s.sessionId}`);
  }
}

function usage(): void {
  console.log(`waygraph -- graph project tool + engine CLI

Primary (less is more):
  waygraph auto  [project|.flow.ts]        Interactive explore (picker)
                 --cli                     Terminal menu instead of browser panel
                 --cli --detach            Run the --cli session as a background socket
                                           server; prints {sessionId, socketPath} and exits
                 --blocks <From> <To>      Graph path-find From->To, then run
                 --data '{...}'            Mem seed (same as demo/run)
                 (pass a .flow.ts to run that flow - same as run)
                 --cli --detach --non-headless  Detached session with a real visible browser
                                           (same --non-headless flag run/demo already use)
  waygraph auto send <sessionId> "<pick>"  Send one pick to a --detach session, print
                                           the resulting state as JSON (no TTY needed).
                                           <pick> is a 1-based menu index, a Block name
                                           (exact match; ambiguous names refuse rather than
                                           guess), or "q"/"quit". Same command as
                                           browser send <sessionId> "<pick>" (prefer that
                                           prefix for a --detach/persistent session).
                 --timeout <ms>            Override the 15s default wait for this one call -
                                           a single Block can legitimately run a slow real
                                           interaction (e.g. a multi-step mouse drag)
  waygraph auto status <sessionId>         Read a --detach session's state (no side effects)
  waygraph auto attach <sessionId>         Reopen an interactive terminal against a
                                           running --detach session
  waygraph auto dom <sessionId>            Read the live page's structure (no side effects)
                 --mode aria|full          Default aria (Playwright ariaSnapshotJSON, AI mode);
                                           full = bounded raw DOM walk (tag/attrs/text/children)
                 --selector <sel>          Scope either mode to one element's subtree
                 --depth N                 Limit snapshot depth (aria: native; full: caller cap)
  waygraph auto trace <sessionId>          Read the session's Checkpoint/Block-level history
                                           (no side effects; not raw click/fill recording)
  waygraph auto console <sessionId>        Read the real browser console/pageerror messages and
                                           failed (4xx/5xx) network responses seen so far - for
                                           diagnosing a silent failure (e.g. a form submit that
                                           does nothing observable in the DOM) that inspectDom
                                           alone can't explain, since it only reads what actually
                                           rendered, not what the page/network actually said
  waygraph auto storage <sessionId>        Read localStorage/sessionStorage plus registered
                                           service workers (scope/active URL/state) - client-
                                           side state (push-subscription/auth tokens etc.) that
                                           never appears in the rendered DOM inspectDom reads
  waygraph auto click <sessionId> <sel>    Click a real element - works even with zero Blocks
                                           (Blind Pilot: act before any Block covers this)
  waygraph auto type <sessionId> <sel> <text>  Fill a real input the same way
  waygraph auto goto <sessionId> <url>     Navigate the real live page
  waygraph auto press <sessionId> <sel> <key>
                                           Presses a real key (Playwright name, e.g. Enter,
                                           Escape, Tab) on a real focused element - many real
                                           inline-edit inputs (no visible Save button until you
                                           type) commit on Enter, not blur/click-elsewhere
  waygraph auto upload <sessionId> <sel> <image|pdf|video|path>
                                           Fill a real <input type="file"> - a built-in stub
                                           (small, real, valid: assets/stubs/stub.png|pdf|mp4)
                                           or a caller-supplied file path
                 (click/type/goto/upload each re-detect the session's Checkpoint afterward,
                  same detection send/status already use)
  waygraph auto reload <sessionId>         Re-discover the project's Block library/graph
                                           from disk without restarting the session - picks
                                           up a Block written to disk mid-session
  waygraph auto reach <sessionId> <Checkpoint>  Path-find from here to Checkpoint and run
                                           the whole route in one call - not one auto send
                                           per step. Same findBlockPath BFS auto --blocks
                                           <From> <To> already uses, against this session's
                                           own live graph/position. Fails loud (not a guess)
                                           if a step has several live options on the page
                                           (an instanceOptions Block) - use send for that step
  waygraph auto resync <sessionId>         Force here to be re-detected from the real live
                                           page right now, discarding whatever was cached -
                                           fixes a session's tracked position going stale
                                           after anything OUTSIDE this session changed the
                                           page (e.g. a human clicking around in a visible
                                           --non-headless session someone is co-driving);
                                           send/reach never do this on their own, since they
                                           only re-detect when the position is already unknown
  waygraph auto highlight <sessionId> '<json>'
                                           Paint agent highlight fixtures on the live page
                                           (rings + optional todos). Same visual language as
                                           Block stubBefore in demo. JSON: rings[{selector,
                                           label,tone?,size?,weight?}], todos[], todoIndex?,
                                           todoTitle?, holdMs? (0=until next), clear:true.
                                           Missing selectors listed in response, not fatal.
                                           Same command as browser highlight <sessionId>
                                           '<json>' (prefer that prefix for a --detach/
                                           persistent session).
                 <selector>|<label>[|<tone>]   Shorthand for 1-3 rings, no JSON braces/quotes
                                           to escape - rings separated by ";", e.g.
                                           "#x|Login button|warning; .err|Error banner|danger".
                                           Covers selector/label/tone only; anything else
                                           (size/weight/zoom/focus/todos/...) needs the JSON
                                           form above.
  waygraph browser                         Show browser subcommands
  waygraph browser start                   Open a new session (headful by default, about:blank)
                 --inject preset|path            Merge an external Block library (e.g. saucedemo)
                 --goto <url>              Navigate on start (disables blank page)
                 --blank                   Force about:blank on start (default)
                 --headless                Headless session (default is visible browser)
                 --cli                     After start, open the terminal picker (auto attach)
  waygraph browser sessions [project]      List live browser sessions (attach/status/stop by id)
  waygraph browser send|status|attach|…    Same session control as auto (see auto send/status/…)
  waygraph pilot start                     Bootstrap: browser session + whole-project graph +
                                           starting snapshot in one call. Does not plan or act.
                 --inject / --goto / --headless / --cli / --base-url  Same flags as browser start
  waygraph pilot sessions [project]        List live sessions (prefer attach over a new start)
  waygraph pilot attach <sessionId>        Graph + snapshot for an existing session (no new browser)
  waygraph pilot send|status|highlight|…   Same session control as browser/auto
  waygraph auto                            Interactive explore (picker) — NOT the persistent browser
                                           layer; use browser/pilot for agent-driven sessions.
  waygraph demo  [--blocks <flow|file|spec>]  Watch with step overlay (QA path)
                 --data '{...}'            Mem seed JSON (or inline flow({...}))
                 --mem-stub                Fill any requires key --data didn't cover from
                                           registerMemStub's registry (needs the key
                                           registered, or the flow's own withMemStub - a
                                           key with neither still fails preflight)
                 --auto-next               Auto-advance steps (alias: --autoplay)
                 --fast                    Shorter auto-next / Next gates (keeps smooth cursor)
                 --full                    Classic wrap-all block chips (default: carousel)
                 --mini                    Force compact mini panel (Hide pill + Next); alias --stepper-mini
                 --todo-left|--todo-right  Floating checklist dock side (also ctx.todoPos / WAYGRAPH_TODO_POS)
                 --todo-full               Opt out: full checklist, no compact/collision/behind-ring
                 --todo-smart              Opt in: compact + collision + behind-ring (default)
                 --ff-expand               Expand fastForwardComposeBlock inners as separate steps
                 --ff-disabled             Dispute: expand FF (alias --no-ff); blitz kept on those inners
                 --auto-play-video         Unattended + recorded: --auto-next + --video (+ step); headless
                 --auto-play-video-head    Same, but keep the browser visible (--non-headless)
                 --video [dir]             Record .webm (demo: headless unless --non-headless)
                 --video-viewport WxH       Recording size (default demo: 1920x1080)
                 --title / --base-url
  waygraph run   [--blocks <flow|file|spec>]  Execute (no overlay unless --step)
                 --data '{...}'
                 --mem-stub                Same as demo's --mem-stub
                 --non-headless            Show browser
                 --video [dir]             Record .webm
                 --video-viewport WxH       Recording size (default run: 1280x720)
                 --ff-expand               Same as demo (expand FFCompose inners)
                 --ff-disabled             Same as demo (dispute: expand FF)
  waygraph test                            Runs the project's @playwright/test suite (cwd) -
                                           thin wrapper: forwards to the local playwright
                                           binary (or npx playwright as a fallback)
                 test ui  /  test --ui     Playwright UI Mode (interactive, watch + trace)
                 test report [dir]         Open the last HTML report (playwright show-report)
                 test show-trace <file>    Open one trace.zip in the trace viewer
                 <any other args>          Forwarded verbatim (--grep, a spec path, --headed, …)
                                           Scaffolds ship trace: "retain-on-failure" + the
                                           html reporter, so a failed waygraph test already
                                           has a trace - test report opens it.

Also:
  waygraph list | nav | validate | check | typecheck | graph | init <name>
                 check/typecheck --no-practices  Skip bad-practice warnings
  waygraph map   [project]                 Waygraph Map convention enforcement: every static
                                           Nav/Page url must verbatim-match its src/map/ folder
                                           path ((group) segments excluded) - exits 1 on a
                                           violation, unlike check's warnings-only stance. A
                                           no-op (exit 0, informational) if the project has no
                                           src/map/ directory at all.
  waygraph traverse [project]              Graph crawl (Phase B-E)
                 --blocks <glob|/re/|sub>  Phase C: filter *.block.ts discovery
                 --parallel N              Phase D: N clone workers (max 4)
                 --session clone|inherit   Phase D: default clone
                 --from <Checkpoint>       Seed / start checkpoint
                 --data '{...}'            Mem seed
                 --max-steps N             Cap Block runs (default 50)
                 --max-visits N            Cap visits per node (default 2)
                 --non-headless            Show browser
  waygraph agent-dive [--loop claude|opencode|cursor|vscode] [--prompts]
                 Initialize coding-agent defs (Playwright init-agents analogue)
  waygraph try [demo|auto|auto:cli]        One-shot saucedemo in a temp dir
                 try auto                  Headed browser panel (default)
                 try auto:cli / --cli      Terminal menu instead
                 try auto --headed         Same as try auto (compat)

Skills (print packaged skill markdown to stdout - for agents / paste):
  waygraph --skill                         List available skills
  waygraph --skill-pilot                   Drive an existing Block graph
  waygraph --skill-pilot-blind             Cold-start: raw ops + author Blocks
  waygraph --skill-convention              Block/Map authoring conventions

Examples:
  waygraph list                                          # file → export map
  waygraph run src/flows/shop.flow.ts --data '{...}'
  waygraph run --blocks shopFlow --non-headless --video
  waygraph demo --blocks src/flows/cart-bulk.flow.ts --auto-next --fast
  waygraph demo src/flows/shop.flow.ts --full
  waygraph try auto
  waygraph try auto:cli
  waygraph auto src/flows/shop.flow.ts --data '{...}'   # run by file (same as run)
  waygraph auto --cli --data '{"saucedemo.credentials":{...}}'
  waygraph auto --blocks LoginPage OrderComplete
  waygraph auto --blocks '/mailpit/'                     # Phase C filtered explore
  waygraph traverse --blocks '**/mailpit/**/*.block.ts'  # Phase C filtered crawl
  waygraph traverse --parallel 2 --session clone         # Phase D clone workers
  waygraph run  --blocks "loginFlow then add-all-to-cart" --data '{...}' --video

Aliases (compat): \`chain <spec>\` -> run --blocks; \`chain auto A B\` -> auto --blocks A B;
  --autoplay -> --auto-next. Prefer the primary verbs above.

Project path optional (defaults to cwd). Flags beat WAYGRAPH_* env.
\`run\`/\`demo\`/\`auto\`: Flow export, .flow.ts path, or "a then b" chain (auto also explores).
Hide stepper = compact "N / M · block" pill. Collapses while a step runs (clicks hit the page). Video mode stays compact.
`);
  process.exit(0);
}

async function main(): Promise<void> {
  if (!command || command === "--help" || command === "-h") {
    usage();
  }

  if (command === "--skill") {
    printSkillIndex();
    process.exit(0);
  }
  if (command && command in SKILL_FLAG_MAP) {
    const stem = SKILL_FLAG_MAP[command as SkillFlag];
    process.stdout.write(readSkillMarkdown(stem));
    process.exit(0);
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
      const flags = parseRunFlags(args.slice(1));
      applyRunFlags(flags);
      const spec = resolveSpec(flags);
      if (!spec) {
        console.error(
          "waygraph run: missing flow/spec — e.g.\n" +
            "  waygraph run src/flows/shop.flow.ts\n" +
            "  waygraph run --blocks shopFlow\n" +
            "  waygraph list   # file → export map\n" +
            "  Flags: --blocks --data --mem-stub --non-headless --video [dir] --step/--no-step",
        );
        process.exit(1);
      }
      const proj = flags.blocks
        ? resolveProjectDir(flags, 0)
        : resolve(flags.positionals[1] ?? process.cwd());
      if (!existsSync(proj)) {
        console.error(`waygraph: no such directory: ${proj}`);
        process.exit(1);
      }
      if (!process.env.WAYGRAPH_BASE_URL) {
        const resolved = resolveBaseUrl(proj);
        if (resolved) process.env.WAYGRAPH_BASE_URL = resolved;
      }
      await runChain(proj, spec);
      break;
    }

    case "test": {
      const rest = args.slice(1);
      const proj = process.cwd();
      const localPlaywrightBin = join(proj, "node_modules", ".bin", "playwright");
      const runPw = (pwArgs: string[]) =>
        existsSync(localPlaywrightBin)
          ? runInherited(localPlaywrightBin, pwArgs, proj)
          : runInherited("npx", ["--yes", "playwright", ...pwArgs], proj);

      // report/show-trace are separate top-level `playwright` commands, not
      // `playwright test` subcommands - handled before the `test` forward below.
      if (rest[0] === "report") {
        process.exitCode = await runPw(["show-report", ...rest.slice(1)]);
        break;
      }
      if (rest[0] === "show-trace") {
        if (!rest[1]) {
          console.error("waygraph test show-trace: missing <trace.zip> (or a test-results/ dir)");
          process.exit(1);
        }
        process.exitCode = await runPw(["show-trace", ...rest.slice(1)]);
        break;
      }

      const wantsUi = rest[0] === "ui" || rest.includes("--ui");
      const forwarded = rest[0] === "ui" ? rest.slice(1) : rest;
      const pwArgs =
        wantsUi && !forwarded.includes("--ui")
          ? ["test", "--ui", ...forwarded]
          : ["test", ...forwarded];
      process.exitCode = await runPw(pwArgs);
      break;
    }

    case "init": {
      initCommand(args[1] ?? "");
      break;
    }

    case "traverse": {
      if (args.includes("--step") || args.includes("--auto-next") || args.includes("--autoplay")) {
        console.error("waygraph traverse: --step / --auto-next not supported (not a demo)");
        process.exit(1);
      }
      const rest = args.slice(1);
      let from: string | undefined;
      let data: string | undefined;
      let maxSteps: number | undefined;
      let maxVisits: number | undefined;
      let maxEdge: number | undefined;
      let headed = false;
      let baseUrl: string | undefined;
      let blocksFilter: string | undefined;
      let parallel: number | undefined;
      let session: "clone" | "inherit" | undefined;
      let minEdgeCoverageRaw: string | undefined;
      let coverageOut: string | undefined;
      let noCoverageReport = false;
      let projectDir = process.cwd();
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i]!;
        if (a === "--from" || a.startsWith("--from=")) {
          from = a.startsWith("--from=") ? a.slice(7) : rest[++i];
          continue;
        }
        if (a === "--data" || a.startsWith("--data=")) {
          data = a.startsWith("--data=") ? a.slice(7) : rest[++i];
          continue;
        }
        if (a === "--blocks" || a.startsWith("--blocks=")) {
          if (a.startsWith("--blocks=")) {
            blocksFilter = a.slice("--blocks=".length);
          } else {
            const v = rest[++i];
            if (!v || v.startsWith("-")) {
              console.error(
                "waygraph traverse: --blocks needs a glob, /regex/, or path substring",
              );
              process.exit(1);
            }
            blocksFilter = v;
          }
          continue;
        }
        if (a === "--parallel" || a.startsWith("--parallel=")) {
          const v = a.startsWith("--parallel=") ? a.slice("--parallel=".length) : rest[++i];
          parallel = Number(v);
          continue;
        }
        if (a === "--session" || a.startsWith("--session=")) {
          const v = a.startsWith("--session=") ? a.slice("--session=".length) : rest[++i];
          if (v !== "clone" && v !== "inherit") {
            console.error('waygraph traverse: --session must be "clone" or "inherit"');
            process.exit(1);
          }
          session = v;
          continue;
        }
        if (a === "--min-edge-coverage" || a.startsWith("--min-edge-coverage=")) {
          minEdgeCoverageRaw = a.startsWith("--min-edge-coverage=")
            ? a.slice("--min-edge-coverage=".length)
            : rest[++i];
          continue;
        }
        if (a === "--coverage-out" || a.startsWith("--coverage-out=")) {
          coverageOut = a.startsWith("--coverage-out=")
            ? a.slice("--coverage-out=".length)
            : rest[++i];
          continue;
        }
        if (a === "--no-coverage-report") {
          noCoverageReport = true;
          continue;
        }
        if (a === "--max-steps" || a.startsWith("--max-steps=")) {
          const v = a.startsWith("--max-steps=") ? a.slice(12) : rest[++i];
          maxSteps = Number(v);
          continue;
        }
        if (a === "--max-visits" || a.startsWith("--max-visits=")) {
          const v = a.startsWith("--max-visits=") ? a.slice(13) : rest[++i];
          maxVisits = Number(v);
          continue;
        }
        if (a === "--max-visits-per-edge" || a.startsWith("--max-visits-per-edge=")) {
          const v = a.startsWith("--max-visits-per-edge=")
            ? a.slice("--max-visits-per-edge=".length)
            : rest[++i];
          maxEdge = Number(v);
          continue;
        }
        if (a === "--non-headless" || a === "--headed") {
          headed = true;
          continue;
        }
        if (a === "--base-url" || a.startsWith("--base-url=")) {
          baseUrl = a.startsWith("--base-url=") ? a.slice(11) : rest[++i];
          continue;
        }
        if (a === "--help" || a === "-h") {
          console.log(`waygraph traverse [project] [flags]

Graph crawl (RFC Phase B-E). Walks unused legal edges until a leaf,
budget kill, or first broken edge. --parallel N uses session clone + edge leases.

  --blocks <glob|/regex/|substr>  Phase C: filter *.block.ts discovery
  --parallel N            Phase D: N clone workers (default 1, max 4)
  --session clone|inherit Phase D: default clone; inherit refused if parallel>1
  --min-edge-coverage X   Phase E: suite gate 0.8 | 80% | 80 (exit 2 if below)
  --coverage-out PATH     Phase E: write JSON (default .waygraph-traverse/coverage.json)
  --no-coverage-report    Phase E: print Coverage line only (no JSON file)
  --from <Checkpoint>     start checkpoint (optional)
  --data '{...}'          Mem seed JSON
  --max-steps N           default 50 (per worker)
  --max-visits N          per-node visit cap (default 2)
  --max-visits-per-edge N default 1
  --non-headless          show browser
  --base-url URL

Examples:
  waygraph traverse --blocks '**/mailpit/**/*.block.ts'
  waygraph traverse --parallel 2 --session clone --max-steps 20
  waygraph traverse --min-edge-coverage 80% --coverage-out ./cov.json

PASS:  [Reached Leaf Node[traverse-1] at=... steps=N]
FAIL:  [Broke at edge[traverse-1] block=... from=... to=...]
COVER: [Coverage edges=H/T ratio=R% min=M% PASS|FAIL]
`);
          process.exit(0);
        }
        if (!a.startsWith("-")) {
          projectDir = resolve(a);
        }
      }
      if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
        console.error(`waygraph traverse: no such directory: ${projectDir}`);
        process.exit(1);
      }
      const blocksSelect = blocksFilter
        ? parseBlocksSelect(blocksFilter)
        : undefined;
      let minEdgeCoverage: number | undefined;
      if (minEdgeCoverageRaw !== undefined) {
        const parsed = parseMinEdgeCoverage(minEdgeCoverageRaw);
        if (parsed === null) {
          console.error(
            `waygraph traverse: --min-edge-coverage expects 0.8, 80%, or 80 (got ${JSON.stringify(minEdgeCoverageRaw)})`,
          );
          process.exit(1);
        }
        minEdgeCoverage = parsed;
      }
      const code = await runTraverse(projectDir, {
        ...(from ? { from } : {}),
        ...(data ? { data } : {}),
        ...(maxSteps !== undefined && Number.isFinite(maxSteps) ? { maxSteps } : {}),
        ...(maxVisits !== undefined && Number.isFinite(maxVisits)
          ? { maxVisitsPerNode: maxVisits }
          : {}),
        ...(maxEdge !== undefined && Number.isFinite(maxEdge)
          ? { maxVisitsPerEdge: maxEdge }
          : {}),
        headed,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
        ...(blocksSelect ? { blocksSelect } : {}),
        ...(parallel !== undefined && Number.isFinite(parallel) ? { parallel } : {}),
        ...(session ? { session } : {}),
        ...(minEdgeCoverage !== undefined ? { minEdgeCoverage } : {}),
        ...(coverageOut ? { coverageOut: resolve(coverageOut) } : {}),
        ...(noCoverageReport ? { noCoverageReport: true } : {}),
      });
      process.exit(code);
    }

    case "agent-dive":
    case "init-agents": {
      // Playwright analogue: npx playwright init-agents --loop <provider>
      const rest = args.slice(1);
      let loop: AgentDiveLoop = "claude";
      let prompts = false;
      let projectDir = process.cwd();
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i]!;
        if (a === "--prompts") {
          prompts = true;
          continue;
        }
        if (a === "--loop" || a.startsWith("--loop=")) {
          const v = a.startsWith("--loop=") ? a.slice("--loop=".length) : rest[++i];
          if (!v || !["claude", "opencode", "cursor", "vscode"].includes(v)) {
            console.error(
              "waygraph agent-dive: --loop must be claude | opencode | cursor | vscode",
            );
            process.exit(1);
          }
          loop = v as AgentDiveLoop;
          continue;
        }
        if (a === "--help" || a === "-h") {
          console.log(`waygraph agent-dive [--loop claude|opencode|cursor|vscode] [--prompts] [project]

Initialize coding-agent definitions for diving an app into waygraph Blocks
(Playwright \`init-agents\` analogue).

  --loop claude     write .claude/agents/*.md (default)
  --loop opencode   write .opencode/prompts/*.md
  --loop cursor     write .cursor/rules/waygraph-*.mdc
  --loop vscode     write .github/agents/*.md
  --prompts         also copy docs/waygraph-agents/*.md

Agents shipped: waygraph-planner, waygraph-author, waygraph-healer.
`);
          process.exit(0);
        }
        if (!a.startsWith("-")) {
          projectDir = resolve(a);
        }
      }
      if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
        console.error(`waygraph agent-dive: no such directory: ${projectDir}`);
        process.exit(1);
      }
      runAgentDive({ loop, projectDir, prompts });
      break;
    }

    case "chain": {
      // Compat alias: chain auto A B -> auto --blocks A B; else -> run --blocks.
      const flags = parseRunFlags(args.slice(1));
      applyRunFlags(flags);
      const first = flags.positionals[0];
      if (first === "auto") {
        const fromTag = flags.positionals[1];
        const toTag = flags.positionals[2];
        if (!fromTag || !toTag) {
          console.error("waygraph chain auto: missing <fromCheckpoint> <toCheckpoint> [project]");
          console.error("  prefer: waygraph auto --blocks LoggedIn OrderComplete");
          process.exit(1);
        }
        const proj = resolve(flags.positionals[3] ?? process.cwd());
        if (!existsSync(proj)) {
          console.error(`waygraph: no such directory: ${proj}`);
          process.exit(1);
        }
        await runChainAuto(proj, fromTag, toTag);
        break;
      }
      const spec = flags.blocks ?? first;
      if (!spec) {
        console.error(
          'waygraph chain: missing <spec> — prefer: waygraph run --blocks "a then b"\n' +
            "  or: waygraph auto --blocks <fromCheckpoint> <toCheckpoint>",
        );
        process.exit(1);
      }
      const proj = resolve(
        flags.blocks ? (flags.positionals[0] ?? process.cwd()) : (flags.positionals[1] ?? process.cwd()),
      );
      if (!process.env.WAYGRAPH_BASE_URL) {
        const resolved = resolveBaseUrl(proj);
        if (resolved) process.env.WAYGRAPH_BASE_URL = resolved;
      }
      // If caller asked for step overlay, behave like demo; else like run.
      if (flags.step === true || process.env.WAYGRAPH_STEP === "1") {
        applyDemoDefaults(proj);
      }
      await runChain(proj, spec);
      break;
    }

    case "demo": {
      const flags = parseRunFlags(args.slice(1));
      applyRunFlags(flags, { allowAutoPlayVideo: true, allowDemoUi: true });
      const spec = resolveSpec(flags);
      if (!spec) {
        console.error(
          "waygraph demo: missing flow/spec — e.g.\n" +
            "  waygraph demo src/flows/shop.flow.ts\n" +
            "  waygraph demo --blocks shopFlow\n" +
            "  Flags: --blocks --data --mem-stub --auto-next --fast --full --mini --ff-expand --ff-disabled --auto-play-video --title --base-url --video",
        );
        process.exit(1);
      }
      const proj = flags.blocks
        ? resolveProjectDir(flags, 0)
        : resolve(flags.positionals[1] ?? process.cwd());
      if (!existsSync(proj)) {
        console.error(`waygraph: no such directory: ${proj}`);
        process.exit(1);
      }
      if (flags.step === undefined && process.env.WAYGRAPH_STEP === undefined) {
        process.env.WAYGRAPH_STEP = "1";
      }
      applyDemoDefaults(proj);
      console.error(
        `waygraph demo: STEP=${process.env.WAYGRAPH_STEP === "1" ? "on" : "off"}` +
          ` AUTO_NEXT=${process.env.WAYGRAPH_AUTOPLAY === "1" ? "on" : "off"}` +
          ` HEADED=${process.env.WAYGRAPH_HEADED === "0" ? "off" : "on"}` +
          ` BASE_URL=${process.env.WAYGRAPH_BASE_URL ?? "(unset)"}` +
          (process.env.WAYGRAPH_VIDEO ? ` VIDEO=${process.env.WAYGRAPH_VIDEO}` : "") +
          (process.env.WAYGRAPH_TITLE ? ` TITLE=${JSON.stringify(process.env.WAYGRAPH_TITLE)}` : ""),
      );
      await runChain(proj, spec);
      break;
    }

    case "graph":
    case "auto":
    case "browser":
    case "pilot": {
      if (command === "browser") {
        const sub = args[1];
        if (sub === "sessions") {
          const rest = args.slice(2);
          const json = rest.includes("--json");
          const positional = rest.filter((a) => a !== "--json");
          const proj = resolve(positional[0] ?? process.cwd());
          const sessions = listBrowserSessions(proj);
          if (json) {
            console.log(JSON.stringify(sessions, null, 2));
          } else {
            printBrowserSessionsList(sessions, proj);
          }
          break;
        }
        if (sub === "stop") {
          const proj = resolve(args[3] ?? process.cwd());
          const target = args[2];
          if (!target) {
            console.error("waygraph browser stop: usage: waygraph browser stop <sessionId|--all> [project]");
            process.exit(1);
          }
          if (target === "--all") {
            const n = stopAllBrowserSessions(proj);
            console.log(JSON.stringify({ stopped: n, projectDir: proj }));
            break;
          }
          if (!stopBrowserSession(proj, target)) {
            console.error(`waygraph browser stop: no such session "${target}"`);
            process.exit(1);
          }
          console.log(JSON.stringify({ stopped: target }));
          break;
        }
        if (!sub) {
          printBrowserUsage();
          break;
        }
        if (sub === "start" || sub.startsWith("-")) {
          const flagArgs = sub === "start" ? args.slice(2) : args.slice(1);
          const flags = parseRunFlags(flagArgs);
          applyRunFlags(flags);
          const proj = resolve(flags.positionals[0] ?? process.cwd());
          if (!existsSync(proj)) {
            console.error(`waygraph browser: no such directory: ${proj}`);
            process.exit(1);
          }
          const baseURL = flags.baseUrl ?? process.env.WAYGRAPH_BASE_URL ?? resolveBaseUrl(proj);
          try {
            const inject = flags.inject?.length ? resolveInjectRoots(flags.inject, proj) : undefined;
            const result = await browserStart({
              projectDir: proj,
              ...(inject?.length ? { inject } : {}),
              ...(baseURL ? { baseURL } : {}),
              ...(flags.goto
                ? { startUrl: flags.goto, skipInitialNavigation: false }
                : { skipInitialNavigation: flags.blank !== false }),
              headless: flags.headlessBrowser === true,
            });
            console.log(JSON.stringify(result));
            if (!result.headless) {
              console.error(`Session ${result.sessionId} started. List all: waygraph browser sessions`);
            }
            if (flags.cli) {
              await runAttachLoop(proj, result.sessionId);
            }
          } catch (err) {
            console.error(`waygraph browser start: ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
          }
          break;
        }
        if (
          sub !== "send" &&
          sub !== "status" &&
          sub !== "attach" &&
          sub !== "dom" &&
          sub !== "trace" &&
          sub !== "console" &&
          sub !== "storage" &&
          sub !== "upload" &&
          sub !== "click" &&
          sub !== "type" &&
          sub !== "press" &&
          sub !== "goto" &&
          sub !== "reload" &&
          sub !== "reach" &&
          sub !== "resync" &&
          sub !== "highlight"
        ) {
          console.error("waygraph browser: unknown subcommand — run `waygraph browser` for usage");
          printBrowserUsage();
          process.exit(1);
        }
      }

      if (command === "pilot") {
        if (args[1] === "sessions") {
          const rest = args.slice(2);
          const json = rest.includes("--json");
          const positional = rest.filter((a) => a !== "--json");
          const proj = resolve(positional[0] ?? process.cwd());
          const sessions = listBrowserSessions(proj);
          if (json) {
            console.log(JSON.stringify(sessions, null, 2));
          } else {
            printBrowserSessionsList(sessions, proj);
          }
          break;
        }
        if (args[1] === "attach") {
          const sessionId = args[2];
          if (!sessionId) {
            console.error("waygraph pilot attach: usage: waygraph pilot attach <sessionId> [--inject …] [project]");
            process.exit(1);
          }
          const flags = parseRunFlags(args.slice(3));
          const proj = resolve(flags.positionals[0] ?? process.cwd());
          try {
            const inject = flags.inject?.length ? resolveInjectRoots(flags.inject, proj) : undefined;
            const result = await pilotAttach(proj, sessionId, inject);
            console.log(JSON.stringify(result));
          } catch (err) {
            console.error(`waygraph pilot attach: ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
          }
          break;
        }
        if (args[1] === "start" || !args[1] || args[1].startsWith("-")) {
          const flagArgs = args[1] === "start" ? args.slice(2) : args.slice(1);
          const flags = parseRunFlags(flagArgs);
          applyRunFlags(flags);
          const proj = resolve(flags.positionals[0] ?? process.cwd());
          const baseURL = flags.baseUrl ?? process.env.WAYGRAPH_BASE_URL ?? resolveBaseUrl(proj);
          try {
            const result = await pilotStart({
              projectDir: proj,
              ...(flags.inject?.length ? { injectTokens: flags.inject } : {}),
              ...(baseURL ? { baseURL } : {}),
              ...(flags.goto
                ? { startUrl: flags.goto, skipInitialNavigation: false }
                : flags.blank === true
                  ? { skipInitialNavigation: true }
                  : {}),
              headless: flags.headlessBrowser === true,
            });
            console.log(JSON.stringify(result));
            if (!result.headless) {
              console.error(
                `Chromium window opened (session ${result.sessionId}). ` +
                  `Terminal menu: waygraph pilot attach ${result.sessionId}`,
              );
            }
            if (flags.cli) {
              await runAttachLoop(proj, result.sessionId);
            }
          } catch (err) {
            console.error(`waygraph pilot start: ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
          }
          break;
        }
        if (
          args[1] !== "send" &&
          args[1] !== "status" &&
          args[1] !== "dom" &&
          args[1] !== "trace" &&
          args[1] !== "console" &&
          args[1] !== "storage" &&
          args[1] !== "upload" &&
          args[1] !== "click" &&
          args[1] !== "type" &&
          args[1] !== "press" &&
          args[1] !== "goto" &&
          args[1] !== "reload" &&
          args[1] !== "reach" &&
          args[1] !== "resync" &&
          args[1] !== "highlight"
        ) {
          console.error(
            "waygraph pilot: usage:\n" +
              "  waygraph pilot start [--inject …] [--goto <url>] [--headless] [--cli] [--base-url <url>] [project]\n" +
              "  waygraph pilot sessions [project]   # list live browser sessions\n" +
              "  waygraph pilot attach <sessionId>   # graph + snapshot for an existing session\n" +
              "  waygraph pilot send|status|attach|highlight|… <sessionId> …  (controls browser — same as browser/auto)",
          );
          process.exit(1);
        }
      }

      // auto send|status|attach <sessionId> - session control against a
      // --detach'd background session. Intercepted before the normal
      // project-directory resolution below, same pattern `try demo|auto|
      // auto:cli` already uses for a sub-verb positional.
      if (
        (command === "auto" || command === "browser" || command === "pilot") &&
        (args[1] === "send" ||
          args[1] === "status" ||
          (args[1] === "attach" && command !== "pilot") ||
          args[1] === "dom" ||
          args[1] === "trace" ||
          args[1] === "console" ||
          args[1] === "storage" ||
          args[1] === "upload" ||
          args[1] === "click" ||
          args[1] === "type" ||
          args[1] === "press" ||
          args[1] === "goto" ||
          args[1] === "reload" ||
          args[1] === "reach" ||
          args[1] === "resync" ||
          args[1] === "highlight")
      ) {
        const sub = args[1];
        const sessionId = args[2];
        if (!sessionId) {
          console.error(`waygraph ${command} ${sub}: missing <sessionId>`);
          process.exit(1);
        }
        const projHint = resolve(process.cwd());
        const meta = resolveSessionMeta(sessionId, projHint);
        if (!meta) {
          console.error(
            `waygraph ${command} ${sub}: no such session "${sessionId}" — ` +
              "wrong directory? run `waygraph pilot sessions` from the project that started it",
          );
          process.exit(1);
        }
        const proj = meta.projectDir;
        if (sub === "attach") {
          await runAttachLoop(proj, sessionId);
          break;
        }
        if (sub === "send") {
          const pick = args[3];
          if (pick === undefined) {
            console.error('waygraph auto send: usage: waygraph auto send <sessionId> "<pick>" [--timeout <ms>]');
            process.exit(1);
          }
          // Real, direct need found live: a single Block can legitimately
          // run a genuinely slow real interaction (e.g. a multi-step mouse
          // drag) that exceeds the 15s default - same reasoning `auto
          // reach` already gets a 90s default for (multiple Blocks in one
          // call). Unlike reach, send has no way to know ahead of time
          // whether the ONE Block it's running is fast or slow, so this is
          // opt-in via a flag rather than a raised default.
          let timeoutMs: number | undefined;
          for (let i = 4; i < args.length; i++) {
            if (args[i] === "--timeout") {
              const raw = args[++i];
              const n = Number(raw);
              if (!Number.isFinite(n) || n <= 0) {
                console.error(`waygraph auto send: --timeout must be a positive number of ms, got "${raw}"`);
                process.exit(1);
              }
              timeoutMs = n;
            }
          }
          const res = await requestSession(proj, sessionId, { op: "send", pick }, timeoutMs);
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "dom") {
          const domArgs = args.slice(3);
          let mode: "aria" | "full" | undefined;
          let selector: string | undefined;
          let depth: number | undefined;
          for (let i = 0; i < domArgs.length; i++) {
            const a = domArgs[i]!;
            if (a === "--mode" || a.startsWith("--mode=")) {
              const v = a.startsWith("--mode=") ? a.slice("--mode=".length) : domArgs[++i];
              if (v !== "aria" && v !== "full") {
                console.error(`waygraph auto dom: --mode must be "aria" or "full", got "${v}"`);
                process.exit(1);
              }
              mode = v;
            } else if (a === "--selector" || a.startsWith("--selector=")) {
              selector = a.startsWith("--selector=") ? a.slice("--selector=".length) : domArgs[++i];
            } else if (a === "--depth" || a.startsWith("--depth=")) {
              const raw = a.startsWith("--depth=") ? a.slice("--depth=".length) : domArgs[++i];
              const n = Number(raw);
              if (!Number.isInteger(n) || n < 1) {
                console.error(`waygraph auto dom: --depth must be a positive integer, got "${raw}"`);
                process.exit(1);
              }
              depth = n;
            } else {
              console.error(`waygraph auto dom: unrecognized argument "${a}"`);
              process.exit(1);
            }
          }
          const res = await requestSession(proj, sessionId, {
            op: "dom",
            ...(mode ? { mode } : {}),
            ...(selector ? { selector } : {}),
            ...(depth !== undefined ? { depth } : {}),
          });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "trace") {
          const res = await requestSession(proj, sessionId, { op: "trace" });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "console") {
          const res = await requestSession(proj, sessionId, { op: "console" });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "storage") {
          const res = await requestSession(proj, sessionId, { op: "storage" });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "click") {
          const selector = args[3];
          if (selector === undefined) {
            console.error('waygraph auto click: usage: waygraph auto click <sessionId> "<selector>"');
            process.exit(1);
          }
          const res = await requestSession(proj, sessionId, { op: "click", selector });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "type") {
          const selector = args[3];
          const text = args[4];
          if (selector === undefined || text === undefined) {
            console.error('waygraph auto type: usage: waygraph auto type <sessionId> "<selector>" "<text>"');
            process.exit(1);
          }
          const res = await requestSession(proj, sessionId, { op: "type", selector, text });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "press") {
          const selector = args[3];
          const key = args[4];
          if (selector === undefined || key === undefined) {
            console.error('waygraph auto press: usage: waygraph auto press <sessionId> "<selector>" <key>');
            process.exit(1);
          }
          const res = await requestSession(proj, sessionId, { op: "press", selector, key });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "goto") {
          const url = args[3];
          if (url === undefined) {
            console.error("waygraph auto goto: usage: waygraph auto goto <sessionId> <url>");
            process.exit(1);
          }
          const res = await requestSession(proj, sessionId, { op: "goto", url });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "upload") {
          const selector = args[3];
          const kindOrPath = args[4];
          if (selector === undefined || kindOrPath === undefined) {
            console.error(
              'waygraph auto upload: usage: waygraph auto upload <sessionId> "<selector>" <image|pdf|video|path-to-file>',
            );
            process.exit(1);
          }
          const stub: { selector: string; stub: "image" | "pdf" | "video" | { filePath: string } } =
            kindOrPath === "image" || kindOrPath === "pdf" || kindOrPath === "video"
              ? { selector, stub: kindOrPath }
              : { selector, stub: { filePath: resolve(process.cwd(), kindOrPath) } };
          const res = await requestSession(proj, sessionId, { op: "upload", ...stub });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "reload") {
          const res = await requestSession(proj, sessionId, { op: "reload" });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "reach") {
          const checkpoint = args[3];
          if (checkpoint === undefined) {
            console.error("waygraph auto reach: usage: waygraph auto reach <sessionId> <Checkpoint>");
            process.exit(1);
          }
          // Longer than every other op's default (15s): a real multi-step
          // route runs several real Blocks in sequence server-side before
          // responding - a legitimately slow single request, not a hang.
          const res = await requestSession(proj, sessionId, { op: "reach", checkpoint }, 90_000);
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "resync") {
          const res = await requestSession(proj, sessionId, { op: "resync" });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "highlight") {
          const raw = args[3];
          if (raw === undefined) {
            console.error(
              `waygraph ${command} highlight: usage:\n` +
                `  waygraph ${command} highlight <sessionId> '{"rings":[{"selector":"#x","label":"X"}]}'\n` +
                `  waygraph ${command} highlight <sessionId> "#x|X" (shorthand: <selector>|<label>[|<tone>], rings separated by ";")`,
            );
            process.exit(1);
          }
          let fixtures: Record<string, unknown>;
          try {
            fixtures = JSON.parse(raw) as Record<string, unknown>;
          } catch (jsonErr) {
            const shorthand = parseHighlightShorthand(raw);
            if (shorthand.type === "error") {
              console.error(
                `waygraph ${command} highlight: body is neither valid JSON (${
                  jsonErr instanceof Error ? jsonErr.message : String(jsonErr)
                }) nor valid shorthand (${shorthand.reason})`,
              );
              process.exit(1);
            }
            fixtures = shorthand.fixtures;
          }
          if (fixtures.op !== undefined && fixtures.op !== "highlight") {
            console.error(`waygraph ${command} highlight: do not set "op" (or set it to "highlight")`);
            process.exit(1);
          }
          const { op: _ignore, ...rest } = fixtures as { op?: string } & Record<string, unknown>;
          const res = await requestSession(proj, sessionId, {
            op: "highlight",
            ...(rest as import("./pilot-overlay.js").PilotHighlightFixtures),
          });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        const res = await requestSession(proj, sessionId, { op: "status" });
        console.log(JSON.stringify(res));
        if (!res.ok) process.exitCode = 1;
        break;
      }

      const flags = parseRunFlags(args.slice(1));
      applyRunFlags(flags);
      const mermaid = flags.mermaid === true;
      const mapOnly = command === "graph" || flags.map === true;
      const cliPicker = flags.cli === true;
      const firstPos = flags.positionals[0];

      // auto src/flows/shop.flow.ts → run that flow (same as `run`). Do not
      // treat a .flow.ts path as a project directory (existsSync is true for files).
      if (command === "auto" && firstPos && looksLikeFlowFileRef(firstPos) && !flags.blocksFromTo) {
        const proj = resolve(process.cwd());
        if (!existsSync(proj) || !statSync(proj).isDirectory()) {
          console.error(`waygraph: no such directory: ${proj}`);
          process.exit(1);
        }
        if (!process.env.WAYGRAPH_BASE_URL) {
          const resolved = resolveBaseUrl(proj);
          if (resolved) process.env.WAYGRAPH_BASE_URL = resolved;
        }
        await runChain(proj, firstPos);
        break;
      }

      const proj = resolve(firstPos ?? process.cwd());
      if (!existsSync(proj)) {
        console.error(`waygraph: no such directory: ${proj}`);
        process.exit(1);
      }
      if (!statSync(proj).isDirectory()) {
        console.error(
          `waygraph ${command}: "${firstPos}" is a file, not a project directory\n` +
            "  run a flow:  waygraph auto src/flows/shop.flow.ts\n" +
            "  or explore:  waygraph auto\n" +
            "  or path-find: waygraph auto --blocks LoginPage OrderComplete",
        );
        process.exit(1);
      }

      // auto --cli --detach: start the explore session as a background socket
      // server instead of blocking in the interactive loop. Session control
      // only applies to --cli (spec: "Headful mode is unaffected").
      if (command === "auto" && flags.detach) {
        if (!cliPicker) {
          console.error("waygraph auto --detach requires --cli (headful has no session control)");
          process.exit(1);
        }
        const baseURL = flags.baseUrl ?? process.env.WAYGRAPH_BASE_URL ?? resolveBaseUrl(proj);
        try {
          const meta = await spawnDetachedSession({
            projectDir: proj,
            ...(baseURL ? { baseURL } : {}),
            ...(flags.nonHeadless ? { headless: false } : {}),
          });
          console.log(
            JSON.stringify({ sessionId: meta.sessionId, socketPath: meta.socketPath, headless: meta.headless }),
          );
        } catch (err) {
          console.error(`waygraph auto --detach: ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }
        break;
      }

      // auto --blocks From To  (graph path-find + run)
      // auto --blocks '/regex/' or '**/*.block.ts'  (Phase C file select → explore)
      if (command === "auto" && (flags.blocksFromTo || flags.blocks)) {
        if (flags.blocksFromTo) {
          const [fromTag, toTag] = flags.blocksFromTo;
          await runChainAuto(proj, fromTag, toTag);
          break;
        }
        if (flags.blocks && isFileSelectToken(flags.blocks)) {
          const blocksSelect = parseBlocksSelect(flags.blocks);
          const baseURL = flags.baseUrl ?? process.env.WAYGRAPH_BASE_URL ?? resolveBaseUrl(proj);
          await runAutoExplore(
            proj,
            baseURL
              ? { cli: cliPicker, baseURL, blocksSelect }
              : { cli: cliPicker, blocksSelect },
          );
          break;
        }
        console.error(
          "waygraph auto --blocks expects <fromCheckpoint> <toCheckpoint>\n" +
            "  or file select: --blocks '**/mailpit/**/*.block.ts' / --blocks '/mailpit/'\n" +
            '  e.g. waygraph auto --blocks LoginPage OrderComplete\n' +
            '  for a hand-named chain use: waygraph run --blocks "a then b"\n' +
            "  or: waygraph auto src/flows/shop.flow.ts",
        );
        process.exit(1);
      }

      if (mapOnly || mermaid) {
        const orphans = await findOrphanBlocks(proj);
        const graph = await discoverGraph(proj);
        if (mermaid) {
          console.log(toMermaid(graph));
        } else {
          console.log(JSON.stringify({ ...graph, orphans }, null, 2));
        }
        console.error(
          `waygraph graph: ${graph.nodes.length} node(s), ${graph.edges.length} edge(s), ` +
            `${graph.skipped.length} Block(s) skipped (Out not resolvable), ` +
            `${orphans.length} orphan Block(s)`,
        );
        if (orphans.length > 0) {
          console.error(
            "waygraph graph: orphan Blocks block auto --blocks path-find - wire each into a .flow.ts (waygraph check)",
          );
        }
        break;
      }
      const baseURL = flags.baseUrl ?? process.env.WAYGRAPH_BASE_URL ?? resolveBaseUrl(proj);
      await runAutoExplore(proj, baseURL ? { cli: cliPicker, baseURL } : { cli: cliPicker });
      break;
    }

    // Hidden: the detached server's own entry point, spawned by
    // `spawnDetachedSession` (auto --cli --detach). Not documented in
    // usage() - not meant to be invoked directly by a person.
    case "__auto-serve": {
      const proj = resolve(args[1] ?? process.cwd());
      const flags = parseRunFlags(args.slice(2));
      const sessionIdIdx = args.indexOf("--session-id");
      const sessionId = sessionIdIdx >= 0 ? args[sessionIdIdx + 1] : undefined;
      if (!sessionId) {
        console.error("waygraph __auto-serve: missing --session-id");
        process.exit(1);
      }
      const baseURL = flags.baseUrl ?? process.env.WAYGRAPH_BASE_URL ?? resolveBaseUrl(proj);
      const inject = flags.inject?.length ? resolveInjectRoots(flags.inject, proj) : undefined;
      let headless: boolean | undefined;
      if (flags.headlessBrowser) headless = true;
      else if (flags.nonHeadless) headless = false;
      await runAutoServeCommand(
        {
          projectDir: proj,
          ...(baseURL ? { baseURL } : {}),
          ...(flags.goto
            ? { startUrl: flags.goto, skipInitialNavigation: false }
            : flags.blank === true
              ? { skipInitialNavigation: true }
              : {}),
          ...(headless !== undefined ? { headless } : {}),
          ...(inject?.length ? { inject } : {}),
        },
        sessionId,
      );
      break;
    }

    case "try": {
      const flags = parseRunFlags(args.slice(1));
      applyRunFlags(flags);
      const modeRaw = (flags.positionals[0] ?? "demo").toLowerCase();
      // auto:cli / --cli = CLI; bare try auto = headed panel
      const mode =
        modeRaw === "auto:cli" || modeRaw === "auto-cli"
          ? "auto:cli"
          : modeRaw === "auto"
            ? "auto"
            : modeRaw;
      if (mode === "auto" || mode === "auto:cli") {
        const cli =
          mode === "auto:cli" || flags.cli === true
            ? true
            : flags.headed === true || flags.nonHeadless === true
              ? false
              : false; // try auto default = headed
        await runTryAuto({ cli });
      } else if (mode === "demo" || mode === "") {
        await runTryDemo();
      } else {
        console.error(
          `waygraph try: unknown mode "${modeRaw}" - use "demo", "auto", or "auto:cli"`,
        );
        process.exitCode = 1;
      }
      break;
    }

    case "typecheck": {
      const flags = parseRunFlags(args.slice(1));
      const proj = resolve(flags.positionals[0] ?? process.cwd());
      await runTypecheckCommand(proj, flags.noPractices === true);
      break;
    }

    case "check": {
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
      break;
    }

    case "map": {
      const proj = resolve(args[1] ?? process.cwd());
      const result = await checkMap(proj);
      if (!result.hasMapDir) {
        console.log(
          `waygraph map: no src/map/ directory under ${proj} - nothing to check ` +
            "(this project isn't on the Waygraph Map convention, or hasn't been migrated yet)",
        );
        break;
      }
      console.log(`waygraph map: ${result.nodes.length} node(s) found under ${relative(proj, result.mapRoot)}`);
      if (result.violations.length === 0) {
        console.log("waygraph map: 0 violations - every static Nav/Page url verbatim-matches its folder path");
      } else {
        for (const v of result.violations) {
          console.error(`waygraph map: ${v.file} (${v.block}) - ${v.reason}`);
        }
        console.error(
          `waygraph map: ${result.violations.length} violation${result.violations.length === 1 ? "" : "s"}`,
        );
        // Unlike `check`'s warnings-only stance, a Map violation is exactly
        // the class of bug this command exists to catch (a fabricated
        // folder grouping that never matched the real site, e.g. the real
        // (auth)/signin/ mistake this command's own header comment cites) -
        // fail loud, not just warn.
        process.exitCode = 1;
      }
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
