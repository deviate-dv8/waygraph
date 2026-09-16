import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const exec = promisify(execFile);
const node = process.execPath;
const CLI = join(import.meta.dirname, "..", "..", "dist", "cli.js");

test("demo without blocks/spec exits with new flag hints", async () => {
  await expect(exec(node, [CLI, "demo"])).rejects.toMatchObject({
    stderr: expect.stringMatching(/--blocks|--auto-play-video|--auto-next/),
  });
});

test("run without blocks/spec exits with new flag hints", async () => {
  await expect(exec(node, [CLI, "run"])).rejects.toMatchObject({
    stderr: expect.stringMatching(/--blocks|--non-headless|--video/),
  });
});

test("run rejects --auto-play-video (demo only)", async () => {
  await expect(
    exec(node, [CLI, "run", "--blocks", "echo", "--auto-play-video", "/tmp"]),
  ).rejects.toMatchObject({
    stderr: expect.stringContaining("demo-only"),
  });
});

test("help lists try auto:cli", async () => {
  const { stdout } = await exec(node, [CLI, "--help"]);
  expect(stdout).toMatch(/try auto:cli/);
  expect(stdout).toMatch(/\.flow\.ts/);
});

test("run resolves .flow.ts path to export name before chain", async () => {
  const saucedemo = join(import.meta.dirname, "..", "..", "examples", "saucedemo");
  // Dry: missing --data should fail after resolving shop.flow.ts → shopFlow (not parse-path error)
  await expect(
    exec(node, [CLI, "run", "src/flows/shop.flow.ts"], { cwd: saucedemo, env: { ...process.env } }),
  ).rejects.toMatchObject({
    stderr: expect.not.stringMatching(/could not parse segment.*shop\.flow\.ts/),
  });
});

test("run bare flow asks for --data (not silent empty Mem)", async () => {
  const saucedemo = join(import.meta.dirname, "..", "..", "examples", "saucedemo");
  await expect(
    exec(node, [CLI, "run", "src/flows/login.flow.ts"], { cwd: saucedemo, env: { ...process.env } }),
  ).rejects.toMatchObject({
    stderr: expect.stringMatching(/--data|WAYGRAPH_DATA|requires/),
  });
});
