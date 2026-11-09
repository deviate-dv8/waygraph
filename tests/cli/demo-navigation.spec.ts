import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

// A step that loads a new page partway (a login that lands on another document): the running step's panel comes back on
// the new page, and the rings after the step skip what the checks saw on the page before it instead of waiting for it.
const exec = promisify(execFile);
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const dir = join(import.meta.dirname, ".tmp-demo-navigation");

test.beforeAll(async () => {
  await mkdir(join(dir, "src", "map", "home"), { recursive: true });
  await mkdir(join(dir, "src", "flows"), { recursive: true });
  const next = pathToFileURL(join(dir, "next.html")).href;
  await writeFile(join(dir, "index.html"), `<h1 id="title">Home</h1><a id="go" href="${next}">Go on</a>`);
  await writeFile(join(dir, "next.html"), `<h1 id="next">Next page</h1>`);
  const url = pathToFileURL(join(dir, "index.html")).href;
  await writeFile(
    join(dir, "src", "map", "home", "home.block.ts"),
    `import { checkpoint, defineMethodBlock, defineNavBlock, Trait } from "waygraph";
export const Home = checkpoint("Home");
export const Next = checkpoint("Next");
export const NavHome = defineNavBlock({ name: "nav-home", checkpoint: Home, url: ${JSON.stringify(url)}, verify: [Trait.visible("#title")] });
export const GoOn = defineMethodBlock({
  name: "go-on",
  from: Home,
  to: Next,
  instruction: {
    precondition: [Trait.visible("#go")],
    async act(page) {
      await page.locator("#go").click();
      await page.locator("#next").waitFor();
      // The step is still running on the new page: its collapsed panel is back.
      await page.waitForFunction(
        () => document.getElementById("wg-root")?.shadowRoot?.getElementById("wg-panel")?.getAttribute("data-wg-phase") === "running",
        null,
        { timeout: 10_000 },
      );
    },
    verify: [Trait.visible("#next")],
  },
});
`,
  );
  await writeFile(
    join(dir, "src", "flows", "go.flow.ts"),
    `import { map } from "waygraph";
import { GoOn, NavHome } from "../map/home/home.block.js";
export const goFlow = map().gotoPage(NavHome).method(GoOn);
`,
  );
});

test.afterAll(() => rm(dir, { recursive: true, force: true }));

test("a page load inside a step keeps its panel, and the rings skip what's gone at once", async () => {
  test.setTimeout(90_000);
  const started = Date.now();
  const { stdout, stderr } = await exec(process.execPath, [CLI, "demo", "goFlow", dir, "--auto-next", "--fast"], {
    env: { ...process.env, WAYGRAPH_HEADED: "0", FORCE_COLOR: "0" },
    timeout: 80_000,
  });
  const log = stdout + stderr;
  expect(log).toContain("finished: passed");
  expect(log).toMatch(/sel=#go\s+\[SKIP not on the page\]/);
  // Waiting for #go to come back took Playwright's 30s per ring.
  expect(Date.now() - started).toBeLessThan(30_000);
});
