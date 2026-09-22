import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const exec = promisify(execFile);
const node = process.execPath;
const CLI = join(import.meta.dirname, "..", "..", "dist", "cli.js");

test("waygraph --skill lists the three packaged skill flags", async () => {
  const { stdout } = await exec(node, [CLI, "--skill"]);
  expect(stdout).toMatch(/--skill-pilot/);
  expect(stdout).toMatch(/--skill-pilot-blind/);
  expect(stdout).toMatch(/--skill-convention/);
  expect(stdout).toMatch(/agent-dive/);
});

test("waygraph --skill-pilot prints the pilot skill markdown", async () => {
  const { stdout } = await exec(node, [CLI, "--skill-pilot"]);
  expect(stdout).toMatch(/^---\nname: waygraph-pilot\n/);
  expect(stdout).toContain("resync");
  expect(stdout).toContain("auto send");
  expect(stdout).toContain("auto highlight");
  expect(stdout).toMatch(/Pilot supports them|Yes, Pilot paints/i);
});

test("waygraph --skill-pilot-blind prints the blind-pilot skill markdown", async () => {
  const { stdout } = await exec(node, [CLI, "--skill-pilot-blind"]);
  expect(stdout).toMatch(/^---\nname: waygraph-blind-pilot\n/);
  expect(stdout).toContain("browser reload");
  expect(stdout).toContain("browser goto");
});

test("waygraph --skill-convention prints the convention skill markdown", async () => {
  const { stdout } = await exec(node, [CLI, "--skill-convention"]);
  expect(stdout).toMatch(/^---\nname: waygraph-convention\n/);
  expect(stdout).toContain("One distinct action per Block");
  expect(stdout).toContain("waygraph map");
});

test("help lists the skill flags", async () => {
  const { stdout } = await exec(node, [CLI, "--help"]);
  expect(stdout).toMatch(/--skill-pilot/);
  expect(stdout).toMatch(/--skill-pilot-blind/);
  expect(stdout).toMatch(/--skill-convention/);
});
