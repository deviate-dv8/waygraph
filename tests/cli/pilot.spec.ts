import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

/**
 * Proof for openspec/changes/waygraph-pilot: the real `waygraph pilot ask`
 * CLI command against real saucedemo.com, not just the library functions
 * directly (already proven in tests/pilot/pilot.spec.ts). Reuses
 * examples/saucedemo (same reasoning as tests/pilot/pilot.spec.ts - one
 * example already exercises the mechanism end to end, a second one would be
 * redundant proof, not additional coverage).
 */

const exec = promisify(execFile);
const node = process.execPath;
// bin/waygraph, not dist/cli.js directly: `pilot` runs AutoSession.start()
// in-process (no spawned child, unlike auto --cli --detach's own session,
// which spawnDetachedSession always re-spawns through bin/waygraph
// regardless of how the outer command was invoked). bin/waygraph registers
// tsx/esm, which examples/saucedemo's own .block.ts files' .js-suffixed
// sibling imports need to resolve correctly - a real, reproducible
// difference confirmed directly (bare `node dist/cli.js pilot ask ...`
// silently sees zero Blocks; `node bin/waygraph pilot ask ...` sees the
// real menu), not a hypothetical one.
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const sauceRoot = join(import.meta.dirname, "../../examples/saucedemo");

/** The CLI sets exit code 1 on a real, expected failure - stdout still holds the real result. */
async function runCli(args: string[]): Promise<{ stdout: string; code: number }> {
  try {
    const { stdout } = (await exec(node, [CLI, ...args], { cwd: sauceRoot })) as { stdout: string };
    return { stdout, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; code?: number };
    if (e.stdout !== undefined) return { stdout: e.stdout, code: e.code ?? 1 };
    throw err;
  }
}

test("waygraph pilot ask --mode agentic runs the real Block against real saucedemo.com", async () => {
  test.setTimeout(30_000);
  const { stdout, code } = await runCli(["pilot", "ask", "fill in my username", "--mode", "agentic"]);
  expect(code).toBe(0);
  const result = JSON.parse(stdout.trim());
  expect(result.ok).toBe(true);
  expect(result.block).toBe("fill-username");
  expect(result.mode).toBe("agentic");
  expect(result.snapshot.here).toBe("LoginPage");
});

test("waygraph pilot ask --mode narrate highlights without acting, headless", async () => {
  test.setTimeout(30_000);
  const { stdout, code } = await runCli(["pilot", "ask", "fill in my username", "--mode", "narrate"]);
  expect(code).toBe(0);
  const result = JSON.parse(stdout.trim());
  expect(result.ok).toBe(true);
  expect(result.mode).toBe("narrate");
  expect(result.selector).toBe("#user-name");
  expect(result.label).toBe("Username");
});

test("waygraph pilot ask with no confident match fails loud, exit code 1", async () => {
  test.setTimeout(30_000);
  const { stdout, code } = await runCli(["pilot", "ask", "xyzzy plugh qux"]);
  expect(code).toBe(1);
  expect(stdout.trim()).toBe("");
});

test("waygraph pilot ask with the wrong verb reports clear usage, not a crash", async () => {
  test.setTimeout(15_000);
  const { code } = await runCli(["pilot", "notaverb"]);
  expect(code).toBe(1);
});
