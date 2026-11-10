import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

// A demo's overlay stays put between steps on one screen: the banner, the step panel, the caption and the outcome card
// don't go and come back (a viewer reads that as "something new"), even when a step takes a screenshot.
const exec = promisify(execFile);
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const dir = join(import.meta.dirname, ".tmp-demo-overlay-steady");

test.beforeAll(async () => {
  await mkdir(join(dir, "src", "map", "home"), { recursive: true });
  await mkdir(join(dir, "src", "flows"), { recursive: true });
  await writeFile(
    join(dir, "index.html"),
    `<h1 id="title">Form</h1><input id="first"><input id="last"><p>Filled: <span id="count">0</span></p>
<script>for (const id of ["first", "last"]) document.getElementById(id).addEventListener("input", () => {
  document.getElementById("count").textContent = String([...document.querySelectorAll("input")].filter((i) => i.value).length);
});</script>`,
  );
  const url = pathToFileURL(join(dir, "index.html")).href;
  await writeFile(
    join(dir, "src", "map", "home", "home.block.ts"),
    `import { checkpoint, defineMethodBlock, defineNavBlock, defineReadBlock, reads, Trait } from "waygraph";
export const Form = checkpoint("Form");
export const NavForm = defineNavBlock({ name: "nav-form", checkpoint: Form, url: ${JSON.stringify(url)}, verify: [Trait.visible("#title")] });
const fill = (name: string, sel: string, value: string) =>
  defineMethodBlock({
    name,
    from: Form,
    to: Form,
    screenshot: true,
    instruction: { async act(page) { await page.locator(sel).fill(value); }, verify: [Trait.value(sel, value)] },
  });
export const FillFirst = fill("fill-first", "#first", "Ada");
export const FillLast = fill("fill-last", "#last", "Lovelace");
export const Filled = reads("form")<{ count: number }>();
export const ReadForm = defineReadBlock({ name: "read-form", from: [Form], instruction: { read: (ctx) => Filled({ count: ctx.page.number("#count") }) } });
`,
  );
  await writeFile(
    join(dir, "src", "flows", "form.flow.ts"),
    `import { map } from "waygraph";
import { FillFirst, FillLast, NavForm } from "../map/home/home.block.js";
export const formFlow = map()
  .gotoPage(NavForm)
  .method(FillFirst.stubBefore((ctx) => ctx.ui.caption("Fill in the form")))
  .method(FillLast);
`,
  );
});

test.afterAll(() => rm(dir, { recursive: true, force: true }));

test("the banner, panel, caption and outcome card don't blink between steps on one screen", async () => {
  test.setTimeout(90_000);
  const { stdout } = await exec(process.execPath, [CLI, "demo", "formFlow", dir, "--auto-next", "--fast"], {
    env: { ...process.env, WAYGRAPH_HEADED: "0", FORCE_COLOR: "0", WAYGRAPH_OVERLAY_TRACE: "1" },
    timeout: 80_000,
  });
  expect(stdout).toContain("overlay +outcome");
  expect(stdout).toContain("overlay +caption");
  // From the first step on the form to the end (the step before it loads the page: a new document starts bare), nothing
  // goes: rings mark each click and check, so they come and go; nothing else does.
  const onTheForm = stdout.slice(stdout.indexOf("step 2/3"), stdout.indexOf("overlay blinks"));
  expect(onTheForm).toContain("step 3/3");
  expect(onTheForm.match(/overlay -(banner|panel|caption|outcome)\b.*/g) ?? []).toEqual([]);
});

test("demo.overlay leaves out the banner, the panel and the checks, and the demo moves on by itself", async () => {
  test.setTimeout(90_000);
  // No --auto-next: without a panel there's no Next to wait for.
  const { stdout } = await exec(process.execPath, [CLI, "demo", "formFlow", dir, "--fast"], {
    env: { ...process.env, WAYGRAPH_HEADED: "0", FORCE_COLOR: "0", WAYGRAPH_OVERLAY_TRACE: "1", WAYGRAPH_OVERLAY_HIDE: "banner,panel,checks" },
    timeout: 80_000,
  });
  expect(stdout).toContain("finished: passed · 3 steps");
  expect(stdout).toContain("overlay +caption");
  expect(stdout.match(/overlay \+(banner|panel|outcome)\b.*/g) ?? []).toEqual([]);
});
