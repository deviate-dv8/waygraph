import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

/** `waygraph test --flows`: every flow is a Playwright test; exclusive flows run after the rest; a flow's viewport applies. */

const exec = promisify(execFile);
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const project = join(import.meta.dirname, "..", "fixtures", "flow-tests");
const { CHROME_PATH: _c, CHROMIUM_PATH: _cc, ...env } = process.env;
// Both tests run the fixture project: one at a time.
test.describe.configure({ mode: "serial" });

interface Result { title: string; status: string; startTime: string; duration: number }

test("every flow runs as a test; the exclusive one after the others; viewport applied; a URL from a function opens the page", async () => {
  const runLog = await mkdtemp(join(tmpdir(), "flow-tests-runs-"));
  const { stdout } = await exec(process.execPath, [CLI, "test", "--flows", "--reporter=json", "--workers=2"], {
    cwd: project,
    env: { ...env, WAYGRAPH_HEADED: "0", WAYGRAPH_RUN_LOG: runLog },
  });
  const report = JSON.parse(stdout) as { suites: unknown[] };
  const results: Result[] = [];
  const walk = (suite: { specs?: { title: string; tests: { results: { status: string; startTime: string; duration: number }[] }[] }[]; suites?: unknown[] }) => {
    for (const spec of suite.specs ?? []) for (const t of spec.tests) for (const r of t.results) results.push({ title: spec.title, ...r });
    for (const s of suite.suites ?? []) walk(s as never);
  };
  for (const s of report.suites) walk(s as never);
  const by = (name: string) => results.find((r) => r.title.endsWith(name))!;
  expect(results.map((r) => [r.title.split(" › ").pop(), r.status]).sort()).toEqual([
    ["aloneFlow", "passed"],
    ["fnUrlFlow", "passed"],
    ["fnUrlPageFlow", "passed"],
    ["otherFlow", "passed"],
    ["readFlow", "passed"],
    ["wideFlow", "passed"],
  ]);
  const endOf = (r: Result) => Date.parse(r.startTime) + r.duration;
  expect(Date.parse(by("aloneFlow").startTime)).toBeGreaterThanOrEqual(Math.max(endOf(by("wideFlow")), endOf(by("otherFlow"))));
  // Each flow's run log names it (a flow doesn't know its export name; the test does).
  const labels = await Promise.all(
    (await readdir(runLog)).filter((f) => f.endsWith(".jsonl")).map(async (f) => JSON.parse((await readFile(join(runLog, f), "utf8")).split("\n")[0]!).label as string),
  );
  await rm(runLog, { recursive: true, force: true });
  expect(labels.sort()).toEqual(["aloneFlow", "fnUrlFlow", "fnUrlPageFlow", "otherFlow", "readFlow", "wideFlow"]);
});

test("a filter that picks an exclusive flow runs just it, not every flow before it; --grep-invert leaves flows out", async () => {
  // The exclusive flows' project depends on the rest, and Playwright runs a dependency unfiltered: the filter goes on
  // both projects instead.
  const titles = async (args: string[]) => {
    const { stdout } = await exec(process.execPath, [CLI, "test", "--flows", "--reporter=json", ...args], {
      cwd: project,
      env: { ...env, WAYGRAPH_HEADED: "0", WAYGRAPH_RUN_LOG: "0" },
    });
    const names: string[] = [];
    const walk = (suite: { specs?: { title: string; tests: { results: unknown[] }[] }[]; suites?: unknown[] }) => {
      for (const spec of suite.specs ?? []) if (spec.tests.some((t) => t.results.length)) names.push(spec.title.split(" › ").pop()!);
      for (const s of suite.suites ?? []) walk(s as never);
    };
    for (const s of (JSON.parse(stdout) as { suites: unknown[] }).suites) walk(s as never);
    return names.sort();
  };
  expect(await titles(["-g", "aloneFlow"])).toEqual(["aloneFlow"]);
  expect(await titles(["--grep-invert", "otherFlow"])).toEqual(["aloneFlow", "fnUrlFlow", "fnUrlPageFlow", "readFlow", "wideFlow"]);
});
