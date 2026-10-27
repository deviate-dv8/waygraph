import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** A run records the mem it was seeded with (run:mem in its run log); `--replay <runId>` seeds exactly that again. */

const exec = promisify(execFile);
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const saucedemo = join(import.meta.dirname, "..", "..", "examples", "saucedemo");
const { CHROME_PATH: _c, CHROMIUM_PATH: _cc, ...env } = process.env;

const runLogOf = (stdout: string) => /waygraph: run log (\S+)/.exec(stdout)![1]!;
const seeded = (file: string) =>
  readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.type === "run:mem").map((e) => e.values);

test("a run records its seeded mem, and --replay runs again with exactly that", async () => {
  const problemUser = { username: "problem_user", password: "secret_sauce" };
  const first = await exec(process.execPath, [CLI, "run", "loginFlow", "--data", JSON.stringify(problemUser)], { cwd: saucedemo, env });
  const firstLog = runLogOf(first.stdout);
  expect(seeded(firstLog)).toEqual([{ "saucedemo.credentials": problemUser }]);

  // No --data: without --replay the flow's mem stub would sign in as standard_user.
  const runId = firstLog.split("/").pop()!.replace(/\.jsonl$/, "");
  const again = await exec(process.execPath, [CLI, "run", "loginFlow", "--replay", runId], { cwd: saucedemo, env });
  expect(again.stdout).toMatch(/chain finished/);
  expect(seeded(runLogOf(again.stdout))).toEqual([{ "saucedemo.credentials": problemUser }]);
});

test("--replay with a run id that has no log says so", async () => {
  const failed = await exec(process.execPath, [CLI, "run", "loginFlow", "--replay", "no-such-run"], { cwd: saucedemo, env }).catch((e: { stderr: string }) => e);
  expect((failed as { stderr: string }).stderr).toMatch(/no run log for "no-such-run"/);
});
