import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

/** `waygraph test --flows` adds one access test per account when the project says who's given what (`for`). */

const exec = promisify(execFile);
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const project = join(import.meta.dirname, "..", "fixtures", "access");
const { CHROME_PATH: _c, CHROMIUM_PATH: _cc, ...env } = process.env;

interface Spec { title: string; tags: string[]; tests: { results: { status: string; error?: { message?: string } }[] }[] }

test("each account's access test: the links it's given show, others don't, and a page it isn't given doesn't open", async () => {
  // The app shows Reports to everyone, though only admins are given it: the planner's test fails, naming it.
  const out = await exec(process.execPath, [CLI, "test", "--flows", "--reporter=json"], {
    cwd: project,
    env: { ...env, WAYGRAPH_HEADED: "0" },
  }).catch((err: { stdout: string }) => err);
  const report = JSON.parse(out.stdout) as { suites: unknown[] };
  const specs: Spec[] = [];
  const walk = (suite: { specs?: Spec[]; suites?: unknown[] }) => {
    specs.push(...(suite.specs ?? []));
    for (const s of suite.suites ?? []) walk(s as never);
  };
  for (const s of report.suites) walk(s as never);
  const spec = (title: string) => specs.find((s) => s.title === title);
  const by = (title: string) => spec(title)?.tests[0];
  expect(specs.map((s) => s.title).sort()).toEqual([
    "access › admin",
    "access › planner",
    "src/flows/planner.flow.ts › plannerAdminFlow",
    "src/flows/planner.flow.ts › plannerReportsFlow",
  ]);
  expect(by("access › admin")?.results[0]?.status).toBe("passed");
  expect(spec("access › admin")?.tags.sort()).toEqual(["access", "admin"]);
  const planner = by("access › planner")?.results[0];
  expect(planner?.status).toBe("failed");
  expect(planner?.error?.message).toContain("sidebar › reports shows, and planner isn't given it (#reports)");
  // It isn't given /admin, and /admin doesn't open for it: not a problem.
  expect(planner?.error?.message).not.toContain("opened");
  expect(planner?.error?.message).not.toContain("sidebar › admin");
});

test("waygraph check: a flow as an account that uses a link, Method or page it isn't given", async () => {
  const { stdout, stderr } = await exec(process.execPath, [CLI, "check", "--no-practices"], { cwd: project, env: { ...env } });
  const lines = (stdout + stderr).split("\n").filter((l) => l.includes(" runs as "));
  expect(lines).toEqual([
    "waygraph check: src/flows/planner.flow.ts (plannerAdminFlow) runs as planner, but admin-page is only for admin - run it as one of them, or give planner admin-page (its for)",
    "waygraph check: src/flows/planner.flow.ts (plannerReportsFlow) runs as planner, but sidebar-reports is only for admin - run it as one of them, or give planner sidebar-reports (its for)",
  ]);
});
