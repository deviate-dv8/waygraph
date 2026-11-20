import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

/** `regression: { exclude }`: the full run leaves a label's flows out (skipped, with how to run them); picking the label, or --all, plays them. */

const exec = promisify(execFile);
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const project = join(import.meta.dirname, "..", "fixtures", "regression");
const { CHROME_PATH: _c, CHROMIUM_PATH: _cc, ...env } = process.env;
test.describe.configure({ mode: "serial" });

async function statuses(args: string[]): Promise<Record<string, string>> {
  const { stdout } = await exec(process.execPath, [CLI, "test", "--flows", "--reporter=json", ...args], { cwd: project, env: { ...env, WAYGRAPH_HEADED: "0", WAYGRAPH_RUN_LOG: "0" } });
  const out: Record<string, string> = {};
  const walk = (suite: { specs?: { title: string; tests: { results: { status: string }[] }[] }[]; suites?: unknown[] }) => {
    for (const spec of suite.specs ?? []) for (const t of spec.tests) if (t.results.length) out[spec.title.split(" › ").pop()!] = t.results[0]!.status;
    for (const s of suite.suites ?? []) walk(s as never);
  };
  for (const s of (JSON.parse(stdout) as { suites: unknown[] }).suites) walk(s as never);
  return out;
}

test("the full run skips the excluded label's flows, and says how to run them", async () => {
  expect(await statuses([])).toEqual({ okFlow: "passed", dbFlow: "skipped", plainFlow: "passed" });
});

test("picking the label, or --all, plays them", async () => {
  expect(await statuses(["--label", "empty-db"])).toEqual({ dbFlow: "passed" });
  expect(await statuses(["--all"])).toEqual({ okFlow: "passed", dbFlow: "passed", plainFlow: "passed" });
  expect(await statuses(["--label", "smoke"])).toEqual({ okFlow: "passed", dbFlow: "passed" });
});

test("a named set can include, and --include / --exclude change one run", async () => {
  expect(await statuses(["--regression", "smoke-only"])).toEqual({ okFlow: "passed", dbFlow: "skipped", plainFlow: "skipped" });
  expect(await statuses(["--include", "empty-db", "--exclude", "smoke"])).toEqual({ okFlow: "skipped", dbFlow: "skipped", plainFlow: "skipped" });
  expect(await statuses(["--exclude", "smoke"])).toEqual({ okFlow: "skipped", dbFlow: "skipped", plainFlow: "passed" });
});

test("an unknown set is refused, naming the ones there are", async () => {
  const run = exec(process.execPath, [CLI, "test", "--regression", "nope"], { cwd: project, env });
  await expect(run).rejects.toMatchObject({ stderr: expect.stringContaining("smoke-only") });
});

test("waygraph test plays the flows without --flows, and --specs asks for spec files", async () => {
  const { stdout } = await exec(process.execPath, [CLI, "test", "--reporter=json"], { cwd: project, env: { ...env, WAYGRAPH_HEADED: "0", WAYGRAPH_RUN_LOG: "0" } });
  expect(stdout).toContain("okFlow");
  const specs = exec(process.execPath, [CLI, "test", "--specs", "--reporter=json"], { cwd: project, env: { ...env, WAYGRAPH_HEADED: "0", WAYGRAPH_RUN_LOG: "0" } });
  await expect(specs).rejects.toMatchObject({ stdout: expect.not.stringContaining("okFlow") });
});

test("waygraph list marks the flows the full run leaves out", async () => {
  const { stdout } = await exec(process.execPath, [CLI, "list"], { cwd: project, env });
  expect(stdout).toContain("dbFlow  [smoke, empty-db]  (left out of the full run: empty-db)");
  expect(stdout).not.toContain("okFlow  [smoke]  (left out");
});
