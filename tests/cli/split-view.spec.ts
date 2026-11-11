import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

// A flow with panes, played to be seen: side by side on one stage (one window, one video), or in windows side by side.
const exec = promisify(execFile);
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const dir = join(import.meta.dirname, ".tmp-split-view");
// One fixture project for both tests: one worker, so neither deletes it under the other.
test.describe.configure({ mode: "serial" });

let server: Server;
let origin = "";
test.beforeAll(async () => {
  await mkdir(join(dir, "src", "map", "form"), { recursive: true });
  await mkdir(join(dir, "src", "flows"), { recursive: true });
  // What each pane typed stays in its own browser context: the other pane's form starts empty.
  await writeFile(
    join(dir, "index.html"),
    `<h1 id="title">Form</h1><input id="name"><p>Filled: <span id="count">0</span></p>
<script>const name = document.getElementById("name");
name.value = localStorage.getItem("name") ?? "";
const show = () => (document.getElementById("count").textContent = name.value ? "1" : "0");
name.addEventListener("input", () => { localStorage.setItem("name", name.value); show(); });
show();</script>`,
  );
  // Over HTTP: an extension doesn't touch file:// pages.
  server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(readFileSync(join(dir, "index.html")));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  const url = origin;
  await writeFile(
    join(dir, "src", "map", "form", "form.block.ts"),
    `import { checkpoint, defineMethodBlock, defineNavBlock, Trait } from "waygraph";
export const Form = checkpoint("Form");
export const NavForm = defineNavBlock({ name: "nav-form", checkpoint: Form, url: ${JSON.stringify(url)}, verify: [Trait.visible("#title")] });
export const FillName = defineMethodBlock({
  name: "fill-name",
  from: Form,
  to: Form,
  instruction: { async act(page) { await page.locator("#name").fill("Ada"); }, verify: [Trait.text("#count", "1")] },
});
export const StillEmpty = defineMethodBlock({ name: "still-empty", from: Form, to: Form, instruction: { async act() {}, verify: [Trait.text("#count", "0")] } });
`,
  );
  // A tiny extension: it marks every page it loads on, so a pane without it is easy to see.
  await mkdir(join(dir, "ext"), { recursive: true });
  await writeFile(join(dir, "ext", "manifest.json"), JSON.stringify({ manifest_version: 3, name: "mark", version: "1", content_scripts: [{ matches: ["<all_urls>"], js: ["mark.js"], run_at: "document_end" }] }));
  await writeFile(join(dir, "ext", "mark.js"), `const d = document.createElement("div"); d.id = "from-ext"; d.textContent = "ext"; document.body.append(d);`);
  await writeFile(
    join(dir, "src", "flows", "ext.flow.ts"),
    `import { map, pane, defineMethodBlock, Trait } from "waygraph";
import { Form, NavForm } from "../map/form/form.block.js";
const Check = defineMethodBlock({ name: "ext-loaded", from: Form, to: Form, instruction: { async act() {}, verify: [Trait.visible("#from-ext")] } });
const One = pane("one");
const Two = pane("two");
export const extFlow = map({ panes: [One, Two] }).in(One).gotoPage(NavForm).method(Check).in(Two).gotoPage(NavForm).method(Check);
`,
  );
  await writeFile(
    join(dir, "src", "flows", "split.flow.ts"),
    `import { map, pane } from "waygraph";
import { FillName, NavForm, StillEmpty } from "../map/form/form.block.js";
const Left = pane("left");
const Right = pane("right");
export const splitFlow = map({ panes: [Left, Right] })
  .in(Left).gotoPage(NavForm).method(FillName)
  .in(Right).gotoPage(NavForm).method(StillEmpty)
  .in(Left).method(FillName);
`,
  );
});

test.afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  await rm(dir, { recursive: true, force: true });
});

test("a recorded demo of a flow with panes: one video of the stage, and one per pane with --video-panes", async () => {
  test.setTimeout(120_000);
  const videos = join(dir, "videos");
  const { stdout } = await exec(process.execPath, [CLI, "demo", "splitFlow", dir, "--auto-next", "--fast", "--video", videos, "--video-panes"], {
    env: { ...process.env, WAYGRAPH_HEADED: "0", FORCE_COLOR: "0" },
    timeout: 110_000,
  });
  expect(stdout, stdout.split("\n").filter((l) => l.includes("saved")).join("\n")).toContain(videos);
  expect(stdout).toContain("chain finished");
  expect(stdout).toContain("pane left's video saved");
  expect(stdout).toContain("pane right's video saved");
  expect((await readdir(videos)).filter((f) => f.endsWith(".webm"))).toHaveLength(3);
});

test("--split windows plays each pane in a window of its own", async () => {
  test.setTimeout(120_000);
  const { stdout } = await exec(process.execPath, [CLI, "demo", "splitFlow", dir, "--auto-next", "--fast", "--split", "windows"], {
    env: { ...process.env, WAYGRAPH_HEADED: "0", FORCE_COLOR: "0" },
    timeout: 110_000,
  });
  expect(stdout).toContain("chain finished");
});

test("extensions load in every pane of a demo: each pane with its own context is a persistent one", async () => {
  test.setTimeout(120_000);
  const { stdout } = await exec(process.execPath, [CLI, "demo", "extFlow", dir, "--auto-next", "--fast"], {
    env: { ...process.env, WAYGRAPH_HEADED: "0", FORCE_COLOR: "0", WAYGRAPH_EXTENSIONS: join(dir, "ext") },
    timeout: 110_000,
  });
  expect(stdout).toContain("chain finished");
});
