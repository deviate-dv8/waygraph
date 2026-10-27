import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** `--input` gives a flow its input (map({ input })); a list plays the flow once per item. */

const exec = promisify(execFile);
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const saucedemo = join(import.meta.dirname, "..", "..", "examples", "saucedemo");
const { CHROME_PATH: _c, CHROMIUM_PATH: _cc, ...env } = process.env;

test("a list of inputs plays the flow once per item, each with its own", async () => {
  const items = [
    { id: "sauce-labs-bike-light", name: "Sauce Labs Bike Light" },
    { id: "sauce-labs-onesie", name: "Sauce Labs Onesie" },
  ];
  const { stdout } = await exec(process.execPath, [CLI, "run", "addItemFlow", "--input", JSON.stringify(items)], { cwd: saucedemo, env });
  expect(stdout).toMatch(/chain finished -- \{"__state":"CartPage"\}/);
  const log = /waygraph: run log (\S+)/.exec(stdout)![1]!;
  const mems = readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.type === "run:mem");
  expect(mems.map((e) => [e.flow, e.values["saucedemo.selectedItem"]])).toEqual([
    ["addItemFlow #1", items[0]],
    ["addItemFlow #2", items[1]],
  ]);
});

test("--input on a flow that takes none says so", async () => {
  const failed = await exec(process.execPath, [CLI, "run", "loginFlow", "--input", "{}"], { cwd: saucedemo, env }).catch((e: { stderr: string }) => e);
  expect((failed as { stderr: string }).stderr).toMatch(/--input needs one flow that takes input/);
});
