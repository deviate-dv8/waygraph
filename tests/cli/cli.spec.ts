import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const exec = promisify(execFile);
const node = process.execPath;
const CLI = join(import.meta.dirname, "..", "..", "dist", "cli.js");

// Plain object literals, no `import { ... } from "waygraph"` - a Flow is a
// duck-typed shape (`.run`), and these fixtures avoid needing their own
// node_modules for the happy-path list/validate checks.
const VALID_FLOW = `
export const DemoFlow = {
  async run() {
    return { __state: "Done" };
  },
};
`;

const BROKEN_FLOW = `
import { thisDoesNotExist } from "nowhere";
export const BrokenFlow = {
  async run() {
    return thisDoesNotExist;
  },
};
`;

async function withTmpProject(name: string, files: Record<string, string>, run: (dir: string) => Promise<void>) {
  const tmpDir = join(import.meta.dirname, `.tmp-${name}`);
  await mkdir(join(tmpDir, "src", "flows"), { recursive: true });
  for (const [rel, contents] of Object.entries(files)) {
    await writeFile(join(tmpDir, "src", "flows", rel), contents);
  }
  try {
    await run(tmpDir);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

test("waygraph --help prints usage", async () => {
  const { stdout } = await exec(node, [CLI, "--help"]);
  expect(stdout).toContain("waygraph");
  expect(stdout).toContain("waygraph list");
  expect(stdout).toContain("waygraph init");
  expect(stdout).toContain("chain auto");
});

test("waygraph list discovers flow files", async () => {
  await withTmpProject("list-basic", { "demo.flow.ts": VALID_FLOW }, async (dir) => {
    const { stdout } = await exec(node, [CLI, "list", dir]);
    expect(stdout).toContain("DemoFlow");
  });
});

test("waygraph list reports no flows found", async () => {
  await withTmpProject("list-empty", {}, async (dir) => {
    const { stdout } = await exec(node, [CLI, "list", dir]);
    expect(stdout).toContain("no flows found");
  });
});

test("waygraph validate succeeds on valid flows", async () => {
  await withTmpProject("validate-ok", { "demo.flow.ts": VALID_FLOW }, async (dir) => {
    const { stdout } = await exec(node, [CLI, "validate", dir]);
    expect(stdout).toContain("OK");
    expect(stdout).toContain("DemoFlow");
  });
});

test("waygraph validate fails on broken import", async () => {
  await withTmpProject("validate-broken", { "broken.flow.ts": BROKEN_FLOW }, async (dir) => {
    await expect(exec(node, [CLI, "validate", dir])).rejects.toMatchObject({
      stdout: expect.stringContaining("FAIL"),
    });
  });
});

test("waygraph with unknown command prints error", async () => {
  await expect(exec(node, [CLI, "bogus"])).rejects.toMatchObject({
    stderr: expect.stringContaining('unknown command "bogus"'),
  });
});
