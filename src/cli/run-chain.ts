// Split out of the former 8,700-line cli.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { expandSpecFlowFiles, resolveBaseUrl } from "./flags.js";
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
