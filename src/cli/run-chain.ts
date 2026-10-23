import { configuredExtensions } from "../runtime/config.js";
import { defaultRunLogDir } from "../runtime/run-log.js";
import { expandSpecFlowFiles, resolveBaseUrl } from "./flags.js";
import { discoverGraph, findBlockPath, findOrphanBlocks } from "../analysis/graph.js";
import { join } from "node:path";
import { rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

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
export async function runChain(projectDir: string, spec: string): Promise<void> {
  const expanded = await expandSpecFlowFiles(projectDir, spec);
  if (process.env.WAYGRAPH_VIDEO && !process.env.WAYGRAPH_BASE_URL) {
    const resolved = await resolveBaseUrl(projectDir);
    if (resolved) process.env.WAYGRAPH_BASE_URL = resolved;
  }
  const extensions = await configuredExtensions(projectDir);
  process.env.WAYGRAPH_RUN_LOG ??= defaultRunLogDir(projectDir);
  if (extensions.length > 0) process.env.WAYGRAPH_EXTENSIONS = extensions.join(",");
  const tsxEsm = import.meta.resolve("tsx/esm");
  const scriptPath = join(projectDir, `.waygraph-chain-${process.pid}.mjs`);
  writeFileSync(scriptPath, CHAIN_RUNNER_BOOTSTRAP);
  try {
    // webServer is started inside the child (runner/runner.ts), never here - see CHAIN_RUNNER_BOOTSTRAP.
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


export async function runChainAuto(projectDir: string, fromTag: string, toTag: string): Promise<void> {
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
    const resolved = await resolveBaseUrl(projectDir);
    if (resolved) process.env.WAYGRAPH_BASE_URL = resolved;
  }
  await runChain(projectDir, spec);
}
