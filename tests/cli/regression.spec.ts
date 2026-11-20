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
  expect(await statuses([])).toEqual({ okFlow: "passed", dbFlow: "skipped" });
});

test("picking the label, or --all, plays them", async () => {
  expect(await statuses(["--label", "empty-db"])).toEqual({ dbFlow: "passed" });
  expect(await statuses(["--all"])).toEqual({ okFlow: "passed", dbFlow: "passed" });
  expect(await statuses(["--label", "smoke"])).toEqual({ okFlow: "passed", dbFlow: "passed" });
});

test("waygraph list marks the flows the full run leaves out", async () => {
  const { stdout } = await exec(process.execPath, [CLI, "list"], { cwd: project, env });
  expect(stdout).toContain("dbFlow  [empty-db, smoke]  (left out of the full run: empty-db)");
  expect(stdout).not.toContain("okFlow  [smoke]  (left out");
});
