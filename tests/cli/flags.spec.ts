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
});
