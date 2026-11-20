import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

/** `waygraph info`: what waygraph detects in a project. */

const exec = promisify(execFile);
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const project = join(import.meta.dirname, "..", "fixtures", "regression");

test("info prints the config, counts, labels and regression sets, and --json / --verbose give more", async () => {
  const { stdout } = await exec(process.execPath, [CLI, "info"], { cwd: project });
  expect(stdout).toContain("config      config/waygraph.config.ts");
  expect(stdout).toContain("flows       3  (1 left out of the default full run)");
  expect(stdout).toContain("labels      empty-db, smoke");
  expect(stdout).toContain("default exclude empty-db; smoke-only include smoke exclude empty-db");
  const json = JSON.parse((await exec(process.execPath, [CLI, "info", "--json", "--verbose"], { cwd: project })).stdout) as { counts: { flows: number }; flows: { name: string; leftOut?: string }[]; regression: { sets: string[] } };
  expect(json.counts.flows).toBe(3);
  expect(json.regression.sets).toEqual(["default", "smoke-only"]);
  expect(json.flows.find((f) => f.name === "dbFlow")?.leftOut).toBe("empty-db");
});
