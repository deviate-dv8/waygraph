import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";

const exec = promisify(execFile);
const node = process.execPath;
const CLI = join(import.meta.dirname, "..", "..", "dist", "cli.js");
const WAYGRAPH_ROOT = join(import.meta.dirname, "..", "..");

// `requires` must hold a real `MemKey` instance - `chain`'s runner script
// calls `mem.set(key, value)`, and `MemPage.set()` does `instanceof MemKey`
// on it. `import { key } from "waygraph"` needs an actual `node_modules/waygraph`
// in the tmp project below (walk-up resolution doesn't find one on its own,
// since this package doesn't list itself in its own node_modules) - so
// `withTmpProject` symlinks one in, matching how a real consumer project
// would have its own waygraph install.
const GREET_BLOCK = `
import { key } from "waygraph";
const GreetInput = key("chain.greet.input");
export const GreetBlock = {
  name: "greet",
  requires: [GreetInput],
  instruction: {
    async act() {},
    resolve() {
      return { __state: "Greeted" };
    },
  },
};
`;

const ECHO_BLOCK = `
export const EchoBlock = {
  name: "echo",
  instruction: {
    async act() {},
    resolve() {
      return { __state: "Echoed" };
    },
  },
};
`;

async function withTmpProject(name: string, files: Record<string, string>, run: (dir: string) => Promise<void>) {
  const tmpDir = join(import.meta.dirname, `.tmp-${name}`);
  await mkdir(join(tmpDir, "src", "blocks"), { recursive: true });
  await mkdir(join(tmpDir, "node_modules"), { recursive: true });
  await symlink(WAYGRAPH_ROOT, join(tmpDir, "node_modules", "waygraph"), "dir");
  for (const [rel, contents] of Object.entries(files)) {
    await writeFile(join(tmpDir, "src", "blocks", rel), contents);
  }
  try {
    await run(tmpDir);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

test("waygraph chain runs a single Block by its runtime name, no payload", async () => {
  await withTmpProject("chain-single", { "echo.block.ts": ECHO_BLOCK }, async (dir) => {
    const { stdout } = await exec(node, [CLI, "chain", "echo", dir]);
    expect(stdout).toContain("chaining echo");
    expect(stdout).toContain('"__state":"Echoed"');
  });
});

test('waygraph chain runs two Blocks in order via "then"', async () => {
  await withTmpProject(
    "chain-two",
    { "greet.block.ts": GREET_BLOCK, "echo.block.ts": ECHO_BLOCK },
    async (dir) => {
      const { stdout } = await exec(node, [CLI, "chain", 'greet({"name":"Dan"}) then echo', dir]);
      expect(stdout).toContain("chaining greet -> echo");
      // The chain's final result is echo's own terminal checkpoint - proves
      // the whole connect() reduction actually ran through both steps, not
      // just the first one.
      expect(stdout).toContain('"__state":"Echoed"');
    },
  );
});

test("waygraph chain errors loudly on a missing required payload", async () => {
  await withTmpProject("chain-missing-payload", { "greet.block.ts": GREET_BLOCK }, async (dir) => {
    await expect(exec(node, [CLI, "chain", "greet", dir])).rejects.toMatchObject({
      stderr: expect.stringContaining("requires chain.greet.input"),
    });
  });
});

test("waygraph chain errors loudly on invalid JSON payload", async () => {
  await withTmpProject("chain-bad-json", { "greet.block.ts": GREET_BLOCK }, async (dir) => {
    await expect(exec(node, [CLI, "chain", "greet({not valid json})", dir])).rejects.toMatchObject({
      stderr: expect.stringContaining("not valid JSON"),
    });
  });
});

test("waygraph chain errors loudly on an unknown block name", async () => {
  await withTmpProject("chain-unknown", { "echo.block.ts": ECHO_BLOCK }, async (dir) => {
    await expect(exec(node, [CLI, "chain", "nonexistent-block", dir])).rejects.toMatchObject({
      stderr: expect.stringContaining('no Block named "nonexistent-block"'),
    });
  });
});

test("waygraph --help mentions chain alias and primary run --blocks", async () => {
  const { stdout } = await exec(node, [CLI, "--help"]);
  expect(stdout).toContain("waygraph run");
  expect(stdout).toContain("--blocks");
  expect(stdout).toMatch(/chain/i);
});
