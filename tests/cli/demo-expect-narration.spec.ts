import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

// An Expect Block's narration plays after the step that expects it, all of it: its rings and its slides.
const exec = promisify(execFile);
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const dir = join(import.meta.dirname, ".tmp-demo-expect-narration");

test.afterAll(() => rm(dir, { recursive: true, force: true }));

test("waygraph demo plays an Expect Block's slides after the step", async () => {
  test.setTimeout(90_000);
  await mkdir(join(dir, "src", "map", "home"), { recursive: true });
  await mkdir(join(dir, "src", "flows"), { recursive: true });
  await writeFile(join(dir, "index.html"), `<h1 id="title">Hello</h1>`);
  const url = pathToFileURL(join(dir, "index.html")).href;
  await writeFile(
    join(dir, "src", "map", "home", "home.block.ts"),
    `import { checkpoint, defineExpectBlock, defineNavBlock, Trait } from "waygraph";
export const Home = checkpoint("Home");
export const NavHome = defineNavBlock({ name: "nav-home", checkpoint: Home, url: ${JSON.stringify(url)}, verify: [Trait.visible("#title")] });
export const ExpectHello = defineExpectBlock({ name: "expect-hello", checkpoint: Home, verify: [Trait.text("#title", "Hello")] });
`,
  );
  await writeFile(
    join(dir, "src", "flows", "hello.flow.ts"),
    `import { map } from "waygraph";
import { ExpectHello, NavHome } from "../map/home/home.block.js";
export const helloFlow = map().gotoPage(NavHome, {
  expect: [ExpectHello.stubAfter((ctx) => ctx.ui.slides([{ caption: "The page says hello" }]))],
});
`,
  );
  const { stdout, stderr } = await exec(process.execPath, [CLI, "demo", "helloFlow", dir, "--auto-next", "--fast"], {
    env: { ...process.env, WAYGRAPH_HEADED: "0" },
    timeout: 80_000,
  });
  expect(stdout + stderr).toContain('slides 1: "The page says hello"');
});
