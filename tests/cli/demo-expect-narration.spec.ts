import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

// After a step, the demo shows how it went: its Expect Blocks' narration (rings and slides), each expectation ticked or
// crossed on the outcome card, and what the page now shows that changed.
const exec = promisify(execFile);
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const dir = join(import.meta.dirname, ".tmp-demo-expect-narration");

test.beforeAll(async () => {
  await mkdir(join(dir, "src", "map", "home"), { recursive: true });
  await mkdir(join(dir, "src", "flows"), { recursive: true });
  await writeFile(
    join(dir, "index.html"),
    `<h1 id="title">Hello</h1><p>Count: <span id="count">0</span></p>
<button id="bump" onclick="document.getElementById('count').textContent = String(Number(document.getElementById('count').textContent) + 1)">Bump</button>`,
  );
  const url = pathToFileURL(join(dir, "index.html")).href;
  await writeFile(
    join(dir, "src", "map", "home", "home.block.ts"),
    `import { checkpoint, defineExpectBlock, defineMethodBlock, defineNavBlock, defineReadBlock, reads, Trait } from "waygraph";
export const Home = checkpoint("Home");
export const NavHome = defineNavBlock({ name: "nav-home", checkpoint: Home, url: ${JSON.stringify(url)}, verify: [Trait.visible("#title")] });
export const Bump = defineMethodBlock({
  name: "bump",
  from: Home,
  to: Home,
  instruction: { async act(page) { await page.locator("#bump").click(); }, verify: [Trait.text("#count", "1")] },
});
export const ExpectHello = defineExpectBlock({ name: "expect-hello", description: "The page says hello", checkpoint: Home, verify: [Trait.text("#title", "Hello")] });
export const ExpectBye = defineExpectBlock({ name: "expect-bye", description: "The page says bye", checkpoint: Home, verify: [Trait.text("#title", "Bye")] });
export const Counter = reads("counter")<{ count: number }>();
export const ReadCounter = defineReadBlock({
  name: "read-counter",
  from: [Home],
  instruction: { read: (ctx) => Counter({ count: ctx.page.number("#count") }) },
});
`,
  );
  await writeFile(
    join(dir, "src", "flows", "hello.flow.ts"),
    `import { map } from "waygraph";
import { Bump, ExpectBye, ExpectHello, NavHome } from "../map/home/home.block.js";
export const slidesFlow = map().gotoPage(NavHome, {
  expect: [ExpectHello.stub((ctx) => ctx.ui.slides([{ caption: "The page says hello" }]))],
});
export const bumpFlow = map().gotoPage(NavHome).method(Bump, { expect: [ExpectHello] });
export const byeFlow = map().gotoPage(NavHome, { expect: [ExpectHello, ExpectBye] });
`,
  );
});

test.afterAll(() => rm(dir, { recursive: true, force: true }));

/** The demo's log for a flow, played headless with auto-next; a failed run's log too. */
async function demo(flow: string): Promise<string> {
  try {
    const { stdout, stderr } = await exec(process.execPath, [CLI, "demo", flow, dir, "--auto-next", "--fast"], {
      // Plain text: the test runner sets FORCE_COLOR, and the demo log would colour its lines.
      env: { ...process.env, WAYGRAPH_HEADED: "0", FORCE_COLOR: "0" },
      timeout: 80_000,
    });
    return stdout + stderr;
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string };
    return (failed.stdout ?? "") + (failed.stderr ?? "");
  }
}

test("waygraph demo plays an Expect Block's slides after the step", async () => {
  test.setTimeout(90_000);
  expect(await demo("slidesFlow")).toContain('slides 1: "The page says hello"');
});

test("the outcome card ticks each expectation and shows what changed", async () => {
  test.setTimeout(90_000);
  const log = await demo("bumpFlow");
  expect(log).toContain("expected ok: The page says hello");
  expect(log).toContain("now shows counter.count: 0 -> 1");
  // A check without an Expect Block is ringed in words, not by its code name.
  expect(log).toMatch(/reads "1"\s+sel=#count/);
  // The demo ends on a card that says it's done.
  expect(log).toMatch(/finished: passed · 2 steps · [\d.]+ s/);
});

test("a failed expectation is crossed on the card, next to the one that held", async () => {
  test.setTimeout(90_000);
  const log = await demo("byeFlow");
  expect(log).toContain("expected ok: The page says hello");
  expect(log).toContain('expected FAILED: The page says bye (saw "Hello")');
  // ...and when a step failed, the card says where it stopped.
  expect(log).toMatch(/finished: stopped · 1 step · [\d.]+ s · Step 1, nav-home: /);
});
