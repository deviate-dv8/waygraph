import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

/**
 * `--mem-stub` / map({ memStub: true }) against the real CLI (spawned process, real
 * generated chain-runner script) - tests/core/mem-stub.spec.ts already
 * covers the in-process engine mechanics (registerMemStub/seedMemStub/
 * preflight); this proves the CLI's seedMemFromRequires wiring end to end.
 */

const exec = promisify(execFile);
const node = process.execPath;
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const saucedemo = join(import.meta.dirname, "..", "..", "examples", "saucedemo");
const unregistered = join(import.meta.dirname, "..", "fixtures", "mem-stub-unregistered");
// Assertions below expect an empty stderr - keep the machine's Chromium override out of it.
const { CHROME_PATH: _c, CHROMIUM_PATH: _cc, ...cleanEnv } = process.env;

test("a flow built with map({ memStub: true }), with its key registered, runs with zero --data", async () => {
  const { stdout, stderr } = await exec(
    node,
    [CLI, "run", "src/flows/mem-stub-demo.flow.ts", "--mem-stub"],
    { cwd: saucedemo, env: cleanEnv },
  );
  expect(stderr).toBe("");
  expect(stdout).toMatch(/chain finished/);
});

test("map({ memStub: true }) alone (no --mem-stub flag) is enough - the flow's own opt-in doesn't need the CLI override", async () => {
  const { stdout, stderr } = await exec(
    node,
    [CLI, "run", "src/flows/mem-stub-demo.flow.ts"],
    { cwd: saucedemo, env: cleanEnv },
  );
  expect(stderr).toBe("");
  expect(stdout).toMatch(/chain finished/);
});

test("a flow that does not opt into memStub, with no --data, still fails exactly as before - regression", async () => {
  await expect(
    exec(node, [CLI, "run", "src/flows/viewer-blocked.flow.ts"], { cwd: saucedemo, env: cleanEnv }),
  ).rejects.toMatchObject({
    stderr: expect.stringMatching(/--data|WAYGRAPH_DATA|requires/),
  });
});

test("--mem-stub alone does not silently succeed for a key with no registered generator", async () => {
  await expect(
    exec(node, [CLI, "run", "src/flows/needs-key.flow.ts", "--mem-stub"], { cwd: unregistered, env: cleanEnv }),
  ).rejects.toMatchObject({
    stderr: expect.stringMatching(/missing required key.*fixture\.needs-a-key|requires fixture\.needs-a-key/),
  });
});

test("help lists --mem-stub for both run and demo", async () => {
  const { stdout } = await exec(node, [CLI, "--help"]);
  expect(stdout).toMatch(/--mem-stub/);
  expect(stdout).toMatch(/registerMemStub/);
});
