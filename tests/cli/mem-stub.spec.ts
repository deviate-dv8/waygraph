import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

/**
 * `--mem-stub` / withMemStub against the real CLI (spawned process, real
 * generated chain-runner script) - tests/core/mem-stub.spec.ts already
 * covers the in-process engine mechanics (registerMemStub/seedMemStub/
 * preflight); this proves the CLI's seedMemFromRequires wiring end to end.
 */

const exec = promisify(execFile);
const node = process.execPath;
const CLI = join(import.meta.dirname, "..", "..", "dist", "cli.js");
const saucedemo = join(import.meta.dirname, "..", "..", "examples", "saucedemo");

test("a flow wrapped in withMemStub, with its key registered, runs with zero --data", async () => {
  const { stdout, stderr } = await exec(
    node,
    [CLI, "run", "src/flows/mem-stub-demo.flow.ts", "--mem-stub"],
    { cwd: saucedemo, env: { ...process.env } },
  );
  expect(stderr).toBe("");
  expect(stdout).toMatch(/chain finished/);
});

test("withMemStub alone (no --mem-stub flag) is enough - the flow's own opt-in doesn't need the CLI override", async () => {
  const { stdout, stderr } = await exec(
    node,
    [CLI, "run", "src/flows/mem-stub-demo.flow.ts"],
    { cwd: saucedemo, env: { ...process.env } },
  );
  expect(stderr).toBe("");
  expect(stdout).toMatch(/chain finished/);
});

test("a flow NOT wrapped in withMemStub, with no --data, still fails exactly as before - regression", async () => {
  await expect(
    exec(node, [CLI, "run", "src/flows/login.flow.ts"], { cwd: saucedemo, env: { ...process.env } }),
  ).rejects.toMatchObject({
    stderr: expect.stringMatching(/--data|WAYGRAPH_DATA|requires/),
  });
});

test("--mem-stub alone does not silently succeed for a key with no registered generator", async () => {
  await expect(
    exec(node, [CLI, "run", "src/flows/login.flow.ts", "--mem-stub"], { cwd: saucedemo, env: { ...process.env } }),
  ).rejects.toMatchObject({
    stderr: expect.stringMatching(/missing required key.*saucedemo\.credentials/),
  });
});

test("help lists --mem-stub for both run and demo", async () => {
  const { stdout } = await exec(node, [CLI, "--help"]);
  expect(stdout).toMatch(/--mem-stub/);
  expect(stdout).toMatch(/registerMemStub/);
});
