import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

/**
 * Proof for `waygraph map` (src/map-check.ts wired into cli.ts): a static
 * Nav/Page Block's own `url` must verbatim-match its folder path under
 * src/map/, (group) segments excluded. Real bug class this catches: a
 * fabricated folder grouping (e.g. (auth)/signin/) that never matched the
 * real site's own URL (/signin, not /auth/signin).
 */

const exec = promisify(execFile);
const node = process.execPath;
const CLI = join(import.meta.dirname, "..", "..", "dist", "cli.js");
const fixtureDir = join(import.meta.dirname, "../fixtures/map-check");
const noMapDir = join(import.meta.dirname, "../fixtures/inline-selector-check");

test("waygraph map flags a folder path that doesn't verbatim-match its Block's real url", async () => {
  let output = "";
  try {
    const { stdout, stderr } = await exec(node, [CLI, "map", fixtureDir]);
    output = stdout + stderr;
  } catch (err) {
    // A violation makes the CLI exit 1 - execFile rejects, but stdout/stderr
    // are still attached to the error.
    const e = err as { stdout?: string; stderr?: string };
    output = (e.stdout ?? "") + (e.stderr ?? "");
  }

  expect(output).toMatch(/2 node\(s\) found/);
  expect(output).toMatch(
    /wrong-folder.*nav-wrong-fixture.*folder path "wrong-folder" doesn't verbatim-match.*"actually-different"/s,
  );
  expect(output).not.toMatch(/nav-home-fixture.*doesn't verbatim-match/);
  expect(output).toMatch(/1 violation/);
});

test("waygraph map is a no-op, not an error, when the project has no src/map/ directory at all", async () => {
  const { stdout, stderr } = await exec(node, [CLI, "map", noMapDir]);
  const output = stdout + stderr;
  expect(output).toMatch(/no src\/map\/ directory under .* - nothing to check/);
});
