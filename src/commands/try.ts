// Split out of the former 8,700-line cli.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { join } from "node:path";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { packageRoot, runInherited } from "../cli/util.js";
import { tmpdir } from "node:os";
import { runChain } from "../cli/run-chain.js";
import { applyRunFlags, parseRunFlags } from "../cli/flags.js";

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

export async function tryCase(args: string[]): Promise<void> {
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
      return;
}
