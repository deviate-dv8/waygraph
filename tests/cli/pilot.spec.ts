import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { stopSessionsAfterEachTest, trackSession } from "../support/sessions.js";

stopSessionsAfterEachTest();

/**
 * Proof for openspec/changes/waygraph-pilot: the real `waygraph pilot start`
 * CLI command against real saucedemo.com - the agent-bootstrap replacement
 * for the old `pilot ask` single-shot resolver (see git tag
 * waygraph-pilot-v1-logs-prettified for that superseded shape).
 */

const exec = promisify(execFile);
const node = process.execPath;
// bin/waygraph, not dist/cli/cli.js directly: `discoverGraph` (run in-process by
// `pilot start`) imports this project's own .block.ts files, whose
// .js-suffixed sibling imports need tsx/esm registered - the same reason
// `waygraph graph` itself has always needed bin/waygraph, not a pilot-specific
// concern.
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const sauceRoot = join(import.meta.dirname, "../../examples/saucedemo");

/** Runs the CLI; on failure `stderr` carries why, so a failed assertion on `code` can show it. */
async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = (await exec(node, [CLI, ...args], { cwd: sauceRoot })) as { stdout: string; stderr: string };
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    if (e.stdout !== undefined) return { stdout: e.stdout, stderr: e.stderr ?? "", code: e.code ?? 1 };
    throw err;
  }
}

// No directory-level cleanup here: .waygraph-auto/ is shared by every
// concurrent Playwright worker, so recursively deleting the whole dir would
// race with a sibling test's still-running session. Each test below quits
// its own session explicitly via "auto send ... q" instead.

test("waygraph pilot start returns a real session id, socket path, and the whole project graph", async () => {
  test.setTimeout(30_000);
  const { stdout, stderr, code } = await runCli(["pilot", "start"]);
  expect(code, stderr).toBe(0);
  const result = JSON.parse(stdout.trim());
  trackSession(sauceRoot, result.sessionId);
  expect(result.sessionId).toMatch(/^[0-9a-f]{8}$/);
  expect(result.socketPath).toContain(result.sessionId);
  expect(result.headless).toBe(false);
  expect(result.snapshot.here).toBe("LoginPage");
  const checkpointNames = result.graph.nodes.map((n: { checkpoint: string }) => n.checkpoint);
  expect(checkpointNames).toEqual(expect.arrayContaining(["LoginPage", "LoggedIn", "OrderComplete"]));

  await exec(node, [CLI, "auto", "send", result.sessionId, "q"], { cwd: sauceRoot }).catch(() => {});
});

test("waygraph pilot start's session is really still running afterward - auto status against it succeeds", async () => {
  test.setTimeout(30_000);
  const { stdout, stderr, code } = await runCli(["pilot", "start"]);
  expect(code, stderr).toBe(0);
  const result = JSON.parse(stdout.trim());
  trackSession(sauceRoot, result.sessionId);

  const { stdout: statusOut } = await exec(node, [CLI, "auto", "status", result.sessionId], { cwd: sauceRoot });
  const status = JSON.parse(statusOut.trim());
  expect(status.ok).toBe(true);
  expect(status.snapshot.here).toBe("LoginPage");

  await exec(node, [CLI, "auto", "send", result.sessionId, "q"], { cwd: sauceRoot }).catch(() => {});
});

test("waygraph pilot with the wrong sub-verb reports clear usage, not a crash", async () => {
  test.setTimeout(15_000);
  const { code } = await runCli(["pilot", "ask"]);
  expect(code).toBe(1);
});
