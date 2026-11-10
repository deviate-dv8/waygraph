// `waygraph install`: sets up what the project's waygraph config requires, on this machine, after `npm install`. The
// config is the list: the browsers its tests use, its browser extensions, its demo's voice, and what those read from
// .env. What waygraph can't install (a system tool) is checked and named. Run it again any time; it does only what's
// missing (`--update` fetches everything again).
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { findProjectDir, loadWaygraphConfig, type WaygraphConfig } from "../../runtime/waygraph-config.js";
import { CACHE_VARIABLE, extensionInfo, resolveExtension } from "../../runtime/extensions.js";
import { listEnvVariables, type EnvVariable } from "../../runtime/env-file.js";
import { parseCommand } from "../args.js";

const run = promisify(execFile);
type Browser = "chromium" | "firefox" | "webkit";

export async function installCase(args: string[]): Promise<void> {
  const { values, positionals } = parseCommand(
    "install",
    {
      update: { type: "boolean", help: "Fetch everything again" },
      "with-deps": { type: "boolean", help: "Also the browsers' system packages (Linux CI; may ask for sudo)" },
    },
    args.slice(1),
  );
  const proj = positionals[0] ? resolve(positionals[0]) : findProjectDir(process.cwd());
  if (!proj) throw new Error("waygraph install: no waygraph project here (a folder with config/waygraph.config.ts, or a package.json that depends on waygraph)");
  const update = values.update === true;
  const config = (await loadWaygraphConfig(proj)) ?? {};
  const todo: string[] = [];

  await installBrowsers(proj, browsersOf(config), { update, withDeps: values["with-deps"] === true });
  const voice = config.demo?.voice?.speaker;
  // A voice that can't be set up here (no Python, no network) doesn't stop the rest: it's named at the end.
  if (voice?.install) {
    try {
      await voice.install({ update, log: (line) => console.log(line) });
    } catch (err) {
      todo.push(`the demo's voice: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const spec of config.extensions ?? []) {
    const dir = await resolveExtension(spec, proj, { update });
    const { name, version } = extensionInfo(dir);
    console.log(`waygraph install: browser extension ${name} ${version} -> ${dir}`);
  }

  // What they read goes in the project's .env files, blank and commented, to fill in.
  const lists: [string, readonly EnvVariable[]][] = [];
  if (voice?.env?.length) lists.push(["the demo's voice (demo.voice)", voice.env]);
  if (config.extensions?.length) lists.push(["browser extensions (extensions)", [CACHE_VARIABLE]]);
  for (const [header, variables] of lists) {
    const files = listEnvVariables(proj, `waygraph install: ${header}`, variables);
    if (files.length) console.log(`waygraph install: listed ${variables.map((v) => v.name).join(", ")} in ${files.join(" and ")}`);
  }

  // What waygraph can't install: checked, and named with how to get it.
  if (voice && !(await onPath("ffmpeg"))) todo.push("ffmpeg (and ffprobe), for the demo's voice-over: your system's package manager (apt install ffmpeg, brew install ffmpeg)");
  const missing = voice?.missing?.();
  if (missing && !todo.some((t) => t.startsWith("the demo's voice"))) todo.push(missing);

  if (todo.length) {
    console.log(`waygraph install: the project needs ${todo.length === 1 ? "one more thing" : `${todo.length} more things`} waygraph can't install:`);
    for (const line of todo) console.log(`  - ${line}`);
    process.exitCode = 1;
  } else {
    console.log("waygraph install: everything the config requires is ready");
  }
}

/** The browsers the config's tests use: Chromium (what waygraph's runs and demos launch), and any its Playwright projects name. */
function browsersOf(config: WaygraphConfig): Browser[] {
  const named = [config.playwright?.use?.browserName, ...(config.playwright?.projects ?? []).map((p) => p.use?.browserName)];
  return [...new Set<Browser>(["chromium", ...named.filter((b): b is Browser => b === "chromium" || b === "firefox" || b === "webkit")])];
}

/** Installs the browsers with the project's own Playwright, so they match the version its tests run (hoisted in a workspace too). */
async function installBrowsers(proj: string, browsers: Browser[], opts: { update: boolean; withDeps: boolean }): Promise<void> {
  let cli: string | undefined;
  for (let at = proj; ; at = dirname(at)) {
    const candidate = join(at, "node_modules", "playwright", "cli.js");
    const viaTest = join(at, "node_modules", "@playwright", "test", "cli.js");
    if (existsSync(viaTest)) cli = viaTest;
    else if (existsSync(candidate)) cli = candidate;
    if (cli || dirname(at) === at) break;
  }
  if (!cli) throw new Error("waygraph install: the project has no @playwright/test installed: run npm install first");
  const args = [cli, "install", ...(opts.withDeps ? ["--with-deps"] : []), ...(opts.update ? ["--force"] : []), ...browsers];
  console.log(`waygraph install: browsers ${browsers.join(", ")} (the project's Playwright)`);
  const code = await new Promise<number>((done) => {
    // Playwright's install also deletes browsers no installed Playwright points at; a project that moved folders still
    // needs its own, so another project's install never removes it.
    const child = spawn(process.execPath, args, { cwd: proj, stdio: "inherit", env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_GC: "1" } });
    child.on("close", (c) => done(c ?? 1));
    child.on("error", () => done(1));
  });
  if (code !== 0) throw new Error(`waygraph install: playwright install ${browsers.join(" ")} exited ${code} (on Linux, --with-deps also installs the system packages they need)`);
}

async function onPath(command: string): Promise<boolean> {
  try {
    await run(command, ["-version"]);
    return true;
  } catch {
    return false;
  }
}
