import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

/**
 * Proof: `waygraph browser start --inject saucedemo` merges an external Block library
 * into a host project that has no Blocks of its own.
 */

const exec = promisify(execFile);
const node = process.execPath;
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const hostRoot = join(import.meta.dirname, "../fixtures/blind-pilot-site");
const SAUCE_URL = "https://www.saucedemo.com/";

async function runCli(args: string[]): Promise<{ stdout: string; code: number }> {
  try {
    const { stdout } = (await exec(node, [CLI, ...args], { cwd: hostRoot })) as { stdout: string };
    return { stdout, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; code?: number };
    if (e.stdout !== undefined) return { stdout: e.stdout, code: e.code ?? 1 };
    throw err;
  }
}

test("waygraph browser start --inject saucedemo loads injected Blocks into the session", async () => {
  test.setTimeout(45_000);
  const { stdout, code } = await runCli([
    "browser",
    "start",
    "--inject",
    "saucedemo",
    "--goto",
    SAUCE_URL,
  ]);
  expect(code).toBe(0);
  const started = JSON.parse(stdout.trim()) as { sessionId: string; headless: boolean; inject: string[] };
  expect(started.sessionId).toMatch(/^[0-9a-f]{8}$/);
  expect(started.headless).toBe(false);
  expect(started.inject.length).toBeGreaterThan(0);

  const { stdout: statusOut } = await exec(node, [CLI, "browser", "status", started.sessionId], {
    cwd: hostRoot,
  });
  const status = JSON.parse(statusOut.trim()) as {
    ok: boolean;
    snapshot: { here: string; sections: Array<{ edges: Array<{ block: string }> }> };
  };
  expect(status.ok).toBe(true);
  expect(status.snapshot.here).toBe("LoginPage");
  const blocks = status.snapshot.sections.flatMap((s) => s.edges.map((e) => e.block));
  expect(blocks).toContain("fill-username");

  await exec(node, [CLI, "browser", "send", started.sessionId, "q"], { cwd: hostRoot }).catch(() => {});
});

test("waygraph pilot sessions lists a live browser session after browser start", async () => {
  test.setTimeout(45_000);
  const { stdout } = await runCli(["browser", "start", "--inject", "saucedemo", "--goto", SAUCE_URL]);
  const started = JSON.parse(stdout.trim()) as { sessionId: string };

  const { stdout: sessionsOut } = await exec(node, [CLI, "pilot", "sessions", "--json"], { cwd: hostRoot });
  const sessions = JSON.parse(sessionsOut.trim()) as Array<{ sessionId: string }>;
  expect(sessions.some((s) => s.sessionId === started.sessionId)).toBe(true);

  const { stdout: attachOut, code } = await runCli([
    "pilot",
    "attach",
    started.sessionId,
    "--inject",
    "saucedemo",
  ]);
  expect(code).toBe(0);
  const attached = JSON.parse(attachOut.trim()) as { sessionId: string; graph: { nodes: Array<{ checkpoint: string }> } };
  expect(attached.sessionId).toBe(started.sessionId);
  const checkpoints = attached.graph.nodes.map((n) => n.checkpoint);
  expect(checkpoints).toContain("LoginPage");

  await exec(node, [CLI, "browser", "send", started.sessionId, "q"], { cwd: hostRoot }).catch(() => {});
});
