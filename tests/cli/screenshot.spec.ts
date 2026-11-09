import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

// A Block with `screenshot: true` leaves a picture of the page once its step is done: with the run, and as the page's
// newest look for Waygraph UI's map. On a Page Block it's the page's: any step that lands there takes one. A Block
// without one leaves none.
const exec = promisify(execFile);
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const dir = join(import.meta.dirname, ".tmp-screenshot");

test.afterAll(() => rm(dir, { recursive: true, force: true }));

test("a Block's screenshot, and a page's, are kept with the run and as each page's newest look", async () => {
  test.setTimeout(90_000);
  await mkdir(join(dir, "src", "map"), { recursive: true });
  await mkdir(join(dir, "src", "flows"), { recursive: true });
  await writeFile(join(dir, "index.html"), `<h1 id="title">Hello</h1><button id="go" onclick="document.getElementById('title').textContent='Done'">Go</button>`);
  const url = pathToFileURL(join(dir, "index.html")).href;
  await writeFile(
    join(dir, "src", "map", "home.block.ts"),
    `import { checkpoint, defineMethodBlock, defineNavBlock, definePageBlock, Trait } from "waygraph";
export const Home = checkpoint("Home");
export const Done = checkpoint("Done");
export const NavHome = defineNavBlock({ name: "nav-home", checkpoint: Home, url: ${JSON.stringify(url)}, verify: [Trait.visible("#title")], screenshot: true });
export const Go = defineMethodBlock({
  name: "go",
  from: Home,
  to: Done,
  instruction: { async act(page) { await page.locator("#go").click(); }, verify: [Trait.text("#title", "Done")] },
});
// The Done page asks for its screenshot; no flow plays this hub, a Method lands there.
export const DonePage = definePageBlock({ name: "page-done", checkpoint: Done, screenshot: true });
`,
  );
  await writeFile(
    join(dir, "src", "flows", "home.flow.ts"),
    `import { map } from "waygraph";
import { Go, NavHome } from "../map/home.block.js";
export const homeFlow = map().gotoPage(NavHome).method(Go);
`,
  );
  await exec(process.execPath, [CLI, "run", "homeFlow", dir], { env: { ...process.env, WAYGRAPH_HEADED: "0" }, timeout: 80_000 });

  const runs = join(dir, ".waygraph", "runs");
  const log = readdirSync(runs).find((f) => f.endsWith(".jsonl"))!;
  const runId = log.replace(/\.jsonl$/, "");
  const events = readFileSync(join(runs, log), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
  const shots = events.filter((e) => e.type === "run:artifact" && e.kind === "screenshot");
  // The Nav that asked, and the Method that landed on the page that asks.
  expect(shots).toHaveLength(2);
  expect(shots[0]).toMatchObject({ block: "nav-home", checkpoint: "Home", index: 0 });
  expect(shots[0]!.path).toBe(join(runs, runId, "00-nav-home.png"));
  expect(shots[1]).toMatchObject({ block: "go", checkpoint: "Done", index: 1 });
  expect(existsSync(join(runs, runId, "00-nav-home.png"))).toBe(true);
  expect(existsSync(join(runs, runId, "01-go.png"))).toBe(true);
  expect(existsSync(join(dir, ".waygraph", "screenshots", "Home.png"))).toBe(true);
  expect(existsSync(join(dir, ".waygraph", "screenshots", "Done.png"))).toBe(true);
});
