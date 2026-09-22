import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

/**
 * Proof: `waygraph check` / bad-practice collector flags typing and multi-action
 * anti-patterns, respects opt-out comments, and `--no-practices` silences them.
 */

const exec = promisify(execFile);
const node = process.execPath;
const CLI = join(import.meta.dirname, "..", "..", "dist", "cli.js");
const fixtureDir = join(import.meta.dirname, "../fixtures/practices-check");

test("waygraph check flags wildcard Checkpoint<string> and assert blocks missing type args", async () => {
  const { stdout, stderr } = await exec(node, [CLI, "check", fixtureDir]);
  const output = stdout + stderr;

  expect(output).toMatch(/wildcard\.block\.ts \(wildcard Checkpoint<string>\)/);
  expect(output).toMatch(/assert-no-type\.block\.ts \(assert block missing type arg\)/);
  expect(output).not.toMatch(/typed\.block\.ts \(wildcard Checkpoint<string>\)/);
  expect(output).not.toMatch(/typed\.block\.ts \(assert block missing type arg\)/);
});

test("waygraph check flags multi-input and combined-action Method blocks", async () => {
  const { stdout, stderr } = await exec(node, [CLI, "check", fixtureDir]);
  const output = stdout + stderr;

  expect(output).toMatch(/multi-input\.block\.ts \(multiple inputs in one Block\)/);
  expect(output).toMatch(/combined-action\.block\.ts \(fill and click in one Block\)/);
  expect(output).not.toMatch(/ignored-multi-input\.block\.ts \(multiple inputs in one Block\)/);
});

test("waygraph check --no-practices skips bad-practice warnings", async () => {
  const { stdout, stderr } = await exec(node, [CLI, "check", "--no-practices", fixtureDir]);
  const output = stdout + stderr;

  expect(output).not.toMatch(/wildcard Checkpoint<string>/);
  expect(output).not.toMatch(/multiple inputs in one Block/);
});
