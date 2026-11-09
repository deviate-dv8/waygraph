import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

/**
 * A run records the mem it was seeded with (run:mem in its run log); `--replay <runId>` seeds that again, except a value
 * made new every run (from `unique`), which is made new again.
 */

const exec = promisify(execFile);
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const saucedemo = join(import.meta.dirname, "..", "..", "examples", "saucedemo");
const { CHROME_PATH: _c, CHROMIUM_PATH: _cc, ...env } = process.env;

const runLogOf = (stdout: string) => /waygraph: run log (\S+)/.exec(stdout)![1]!;
const seeded = (file: string) =>
  readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.type === "run:mem").map((e) => e.values);

test("a run records its seeded mem, and --replay runs again with exactly that", async () => {
  const problemUser = { username: "problem_user", password: "secret_sauce" };
  const first = await exec(process.execPath, [CLI, "run", "loginFlow", "--data", JSON.stringify(problemUser)], { cwd: saucedemo, env });
  const firstLog = runLogOf(first.stdout);
  expect(seeded(firstLog)).toEqual([{ "saucedemo.credentials": problemUser }]);

  // No --data: without --replay the flow's mem stub would sign in as standard_user.
  const runId = firstLog.split("/").pop()!.replace(/\.jsonl$/, "");
  const again = await exec(process.execPath, [CLI, "run", "loginFlow", "--replay", runId], { cwd: saucedemo, env });
  expect(again.stdout).toMatch(/chain finished/);
  expect(seeded(runLogOf(again.stdout))).toEqual([{ "saucedemo.credentials": problemUser }]);
});

test("--replay with a run id that has no log says so", async () => {
  const failed = await exec(process.execPath, [CLI, "run", "loginFlow", "--replay", "no-such-run"], { cwd: saucedemo, env }).catch((e: { stderr: string }) => e);
  expect((failed as { stderr: string }).stderr).toMatch(/no run log for "no-such-run"/);
});

test("--replay makes a per-run value (from unique) new again, and keeps the rest", async () => {
  const dir = join(import.meta.dirname, ".tmp-replay-unique");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "src", "flows"), { recursive: true });
  writeFileSync(join(dir, "index.html"), '<input id="name"><input id="area">');
  writeFileSync(
    join(dir, "src", "keys.mem-stubs.ts"),
    `import { keys, registerMemStub } from "waygraph";
export const MachineKeys = keys("machine")<{ name: string; area: string }>();
registerMemStub(MachineKeys.name, ({ unique }) => \`WG Grinder \${unique}\`);
registerMemStub(MachineKeys.area, () => "Mixing");
`,
  );
  writeFileSync(
    join(dir, "src", "flows", "add.flow.ts"),
    `import { checkpoint, defineMethodBlock, defineNavBlock, map, Trait } from "waygraph";
import { MachineKeys } from "../keys.mem-stubs.js";
const Add = checkpoint("Add");
const Nav = defineNavBlock({ name: "nav-add", checkpoint: Add, url: ${JSON.stringify(pathToFileURL(join(dir, "index.html")).href)}, verify: [Trait.visible("#name")] });
const Fill = defineMethodBlock({
  name: "fill-machine",
  from: Add,
  to: Add,
  requires: [MachineKeys.name, MachineKeys.area],
  instruction: {
    async act(page, _in, mem) {
      await page.locator("#name").fill(mem.get(MachineKeys.name));
      await page.locator("#area").fill(mem.get(MachineKeys.area));
    },
  },
});
export const addMachineFlow = map({ memStub: true }).gotoPage(Nav).method(Fill);
`,
  );
  try {
    const first = await exec(process.execPath, [CLI, "run", "addMachineFlow", dir], { env: { ...env, WAYGRAPH_HEADED: "0" } });
    const [made] = seeded(runLogOf(first.stdout));
    const runId = runLogOf(first.stdout).split("/").pop()!.replace(/\.jsonl$/, "");
    const again = await exec(process.execPath, [CLI, "run", "addMachineFlow", dir, "--replay", runId], { env: { ...env, WAYGRAPH_HEADED: "0" } });
    const [replayed] = seeded(runLogOf(again.stdout));
    expect(replayed["machine.area"]).toBe("Mixing");
    expect(replayed["machine.name"]).toMatch(/^WG Grinder /);
    // The same machine made twice would be refused: its name is made new.
    expect(replayed["machine.name"]).not.toBe(made["machine.name"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
