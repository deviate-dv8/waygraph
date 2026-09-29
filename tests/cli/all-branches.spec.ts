import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";

const exec = promisify(execFile);
const node = process.execPath;
const CLI = join(import.meta.dirname, "..", "..", "dist", "cli.js");
const WAYGRAPH_ROOT = join(import.meta.dirname, "..", "..");

// about:blank needs no real network - keeps this deterministic and fast, same reasoning
// tests/cli/chain.spec.ts's own no-op Blocks use. Real factories (defineNavBlock/defineMethodBlock),
// not hand-rolled markers - the actual __waygraphKind/__waygraphSalt stamping is factory-internal.
const BRANCH_FLOW = `
import { map, defineNavBlock, defineMethodBlock, checkpoint } from "waygraph";
const NavStart = defineNavBlock({ name: "nav-start", checkpoint: "Start", url: "about:blank" });
const Decide = defineMethodBlock({
  name: "decide",
  instruction: {
    async act() {},
    resolve: () => checkpoint(process.env.WHICH_WAY === "away" ? "Away" : "Home"),
  },
});
const AwayLeaf = defineMethodBlock({
  name: "away-leaf",
  instruction: { async act() {}, resolve: () => checkpoint("Done") },
});
export const branchFlow = map()
  .gotoPage(NavStart)
  .method(Decide)
  .branch({
    Home: null,
    Away: (m) => m.method(AwayLeaf).end(),
  });
`;

const PLAIN_FLOW = `
import { map, defineNavBlock } from "waygraph";
const NavStart = defineNavBlock({ name: "nav-start", checkpoint: "Start", url: "about:blank" });
export const plainFlow = map().gotoPage(NavStart).end();
`;

async function withTmpProject(name: string, files: Record<string, string>, run: (dir: string) => Promise<void>) {
  const tmpDir = join(import.meta.dirname, `.tmp-${name}`);
  await mkdir(join(tmpDir, "src", "flows"), { recursive: true });
  await mkdir(join(tmpDir, "node_modules"), { recursive: true });
  await symlink(WAYGRAPH_ROOT, join(tmpDir, "node_modules", "waygraph"), "dir");
  for (const [rel, contents] of Object.entries(files)) {
    await writeFile(join(tmpDir, "src", "flows", rel), contents);
  }
  try {
    await run(tmpDir);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

test("waygraph run --all-branches explores every .branch() path, not just the live one", async () => {
  await withTmpProject("all-branches", { "branch.flow.ts": BRANCH_FLOW }, async (dir) => {
    const { stdout } = await exec(node, [CLI, "run", "--blocks", "branchFlow", "--all-branches", dir], {
      env: { ...process.env, WAYGRAPH_HEADED: "0", WHICH_WAY: "home" },
    });
    expect(stdout).toContain("Home -> ok");
    expect(stdout).toContain("Away -> ok");
  });
});

test("--all-branches --shared-session follows only the single live-dispatch path", async () => {
  await withTmpProject("all-branches-shared", { "branch.flow.ts": BRANCH_FLOW }, async (dir) => {
    const { stdout } = await exec(
      node,
      [CLI, "run", "--blocks", "branchFlow", "--all-branches", "--shared-session", dir],
      { env: { ...process.env, WAYGRAPH_HEADED: "0", WHICH_WAY: "away" } },
    );
    expect(stdout).toContain("Away -> ok");
    expect(stdout).not.toContain("Home -> ok");
  });
});

test("--all-branches on a non-branched Flow fails with a clear message, not a confusing crash", async () => {
  await withTmpProject("all-branches-plain", { "plain.flow.ts": PLAIN_FLOW }, async (dir) => {
    await expect(
      exec(node, [CLI, "run", "--blocks", "plainFlow", "--all-branches", dir], {
        env: { ...process.env, WAYGRAPH_HEADED: "0" },
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("was not built with MapBuilder.branch()"),
    });
  });
});

test("--all-branches on a multi-segment chain spec fails with a clear message", async () => {
  await withTmpProject("all-branches-chain", { "branch.flow.ts": BRANCH_FLOW }, async (dir) => {
    await expect(
      exec(node, [CLI, "run", "--blocks", "branchFlow then branchFlow", "--all-branches", dir], {
        env: { ...process.env, WAYGRAPH_HEADED: "0" },
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("needs a single Flow reference"),
    });
  });
});
