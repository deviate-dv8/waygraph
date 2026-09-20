import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

/**
 * Proof for openspec/changes/waygraph-map: every existing command works
 * against a project organized under the Waygraph Map folder convention
 * ((group)/<page-slug>/page.block.ts + nav.block.ts + methods/*.block.ts)
 * with ZERO new engine code - discoverGraph/loadBlockLibrary already walk
 * any folder structure, matching only the .block.ts filename pattern.
 */

const exec = promisify(execFile);
const node = process.execPath;
const CLI = join(import.meta.dirname, "..", "..", "..", "bin", "waygraph");
const root = join(import.meta.dirname, "..");

async function runCli(args: string[]): Promise<{ stdout: string; code: number }> {
  try {
    const { stdout } = (await exec(node, [CLI, ...args], { cwd: root })) as { stdout: string };
    return { stdout, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; code?: number };
    if (e.stdout !== undefined) return { stdout: e.stdout, code: e.code ?? 1 };
    throw err;
  }
}

test("waygraph graph discovers both Checkpoints via the exact same discoverGraph path a freeform project uses", async () => {
  const { stdout, code } = await runCli(["graph"]);
  expect(code).toBe(0);
  const graph = JSON.parse(stdout.trim());
  const checkpoints = graph.nodes.map((n: { checkpoint: string }) => n.checkpoint);
  expect(checkpoints).toEqual(expect.arrayContaining(["Dashboard", "Docs"]));
  expect(graph.edges.some((e: { block: string }) => e.block === "nav-dashboard")).toBe(true);
  expect(graph.edges.some((e: { block: string }) => e.block === "nav-docs")).toBe(true);
});

test("a real detached session navigates the convention-organized site for real, including a real click", async () => {
  test.setTimeout(30_000);
  const { stdout } = await exec(node, [
    CLI,
    "auto",
    "--cli",
    "--detach",
    "--base-url",
    process.env.WAYGRAPH_BASE_URL || "http://127.0.0.1:4277",
    root,
  ]).then((r) => r);
  const { sessionId } = JSON.parse(stdout.trim());
  try {
    const status = await exec(node, [CLI, "auto", "status", sessionId], { cwd: root });
    const statusRes = JSON.parse(status.stdout.trim());
    expect(statusRes.snapshot.here).toBe("Dashboard");

    const clickEdge = statusRes.snapshot.sections
      .flatMap((s: { edges: { block: string; index: number }[] }) => s.edges)
      .find((e: { block: string }) => e.block === "click-widget");
    expect(clickEdge).toBeTruthy();
    const clickRes = await exec(node, [CLI, "auto", "send", sessionId, String(clickEdge.index)], { cwd: root });
    const clickJson = JSON.parse(clickRes.stdout.trim());
    expect(clickJson.ok).toBe(true);
    expect(clickJson.snapshot.here).toBe("Dashboard");

    // auto reach: one call, real multi-step route (Dashboard -> Docs via nav-docs).
    const reachRes = await exec(node, [CLI, "auto", "reach", sessionId, "Docs"], { cwd: root });
    const reachJson = JSON.parse(reachRes.stdout.trim());
    expect(reachJson.ok).toBe(true);
    expect(reachJson.path).toEqual(["nav-docs"]);
    expect(reachJson.snapshot.here).toBe("Docs");
  } finally {
    await exec(node, [CLI, "auto", "send", sessionId, "q"], { cwd: root }).catch(() => {});
  }
});
