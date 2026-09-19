import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

/**
 * Proof for openspec/changes/waygraph-agent-skill-hardening: `waygraph check`
 * flags a Trait.visible/Trait.text call whose selector is an inline string
 * literal, and stays silent when the same selector is referenced through a
 * *Sel object instead - the exact distinction the 40+-file pattern this
 * change answers needed. Trait.url is never scanned (not a selector).
 */

const exec = promisify(execFile);
const node = process.execPath;
const CLI = join(import.meta.dirname, "..", "..", "dist", "cli.js");
const fixtureDir = join(import.meta.dirname, "../fixtures/inline-selector-check");

test("waygraph check flags an inline verify selector and stays silent on a *Sel reference", async () => {
  const { stdout, stderr } = await exec(node, [CLI, "check", fixtureDir]);
  const output = stdout + stderr;

  expect(output).toMatch(/inline\.block\.ts \(assert-inline-selector-fixture\).*inline selector/);
  expect(output).not.toMatch(/sel-referenced\.block\.ts.*inline selector/);
});
