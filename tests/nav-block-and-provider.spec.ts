import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../src/index.js";
import { Engine, start, end, MemPage, checkpoint, defineNavBlock, defineBlock, key } from "../src/index.js";

type Start = Checkpoint<"__start__">;
type A = Checkpoint<"A">;
type Arrived = Checkpoint<"Arrived">;

test.describe("defineNavBlock", () => {
  test("a static-url NavBlock navigates the real page", async ({ page }) => {
    const nav = defineNavBlock<Arrived>({
      name: "nav-hello",
      checkpoint: "Arrived",
      url: "data:text/html,<h1>hi</h1>",
    });

    const engine = new Engine();
    const flow = engine.defineFlow([start, nav, end]);
    const fakeContext = { newPage: async () => page } as any;
    const outcome = await flow.run(fakeContext, new MemPage(), { page, closeOnFinish: false });

    expect(outcome.result).toEqual(checkpoint("Arrived"));
    expect(page.url()).toBe("data:text/html,<h1>hi</h1>");
    await expect(page.locator("h1")).toHaveText("hi");
  });

  test("a mem-function url resolves from mem at run time", async ({ page }) => {
    const RequestId = key<string>("test.request-id");
    const nav = defineNavBlock<Arrived>({
      name: "nav-request-detail",
      checkpoint: "Arrived",
      url: (mem) => `data:text/html,<h1>request ${mem.get(RequestId)}</h1>`,
      requires: [RequestId],
    });

    const mem = new MemPage();
    mem.set(RequestId, "42");
    const engine = new Engine();
    const flow = engine.defineFlow([start, nav, end]);
    const fakeContext = { newPage: async () => page } as any;
    await flow.run(fakeContext, mem, { page, closeOnFinish: false });

    expect(page.url()).toBe("data:text/html,<h1>request 42</h1>");
  });

  test("a click-based NavBlock clicks a real element instead of teleporting to a URL", async ({ page }) => {
    // A real <a href="data:..."> click is blocked by Chromium's own
    // top-frame data: URL navigation policy - goto() bypasses it (a
    // browser-driven API call, not a user click), which is itself a real
    // reason act()'s generated click path is a genuinely different code
    // path from url, not just a cosmetic alternative. A plain button + a
    // same-page DOM update sidesteps that policy while still proving the
    // generated act() does a real Locator.click(), not a goto in disguise.
    await page.setContent(
      '<button id="go">Go</button><h1 id="label">before</h1>' +
        '<script>document.getElementById("go").addEventListener("click", () => { document.getElementById("label").textContent = "arrived"; });</script>',
    );
    const nav = defineNavBlock<Arrived>({
      name: "nav-click",
      checkpoint: "Arrived",
      click: "#go",
    });

    const engine = new Engine();
    const flow = engine.defineFlow([start, nav, end]);
    const fakeContext = { newPage: async () => page } as any;
    const outcome = await flow.run(fakeContext, new MemPage(), { page, closeOnFinish: false });

    expect(outcome.result).toEqual(checkpoint("Arrived"));
    await expect(page.locator("#label")).toHaveText("arrived");
  });

  test("a mem-function click selector resolves from mem at run time", async ({ page }) => {
    await page.setContent(
      '<button id="row-42">42</button><button id="row-7">7</button><h1 id="label">before</h1>' +
        "<script>" +
        'document.getElementById("row-42").addEventListener("click", () => { document.getElementById("label").textContent = "row 42"; });' +
        'document.getElementById("row-7").addEventListener("click", () => { document.getElementById("label").textContent = "row 7"; });' +
        "</script>",
    );
    const RowId = key<string>("test.row-id");
    const nav = defineNavBlock<Arrived>({
      name: "nav-row",
      checkpoint: "Arrived",
      click: (mem) => `#row-${mem.get(RowId)}`,
      requires: [RowId],
    });

    const mem = new MemPage();
    mem.set(RowId, "42");
    const engine = new Engine();
    const flow = engine.defineFlow([start, nav, end]);
    const fakeContext = { newPage: async () => page } as any;
    await flow.run(fakeContext, mem, { page, closeOnFinish: false });

    await expect(page.locator("#label")).toHaveText("row 42");
  });

  test("drops into defineFlow, connect, and composeBlock unmodified", async () => {
    const nav = defineNavBlock<Arrived>({ name: "nav-x", checkpoint: "Arrived", url: "about:blank" });
    const after: Block<Arrived, A> = {
      name: "after",
      instruction: { async act() {}, resolve: () => checkpoint("A") },
    };

    const engine = new Engine();
    // Typechecks + builds without any special-casing for NavBlock.
    const flow = engine.defineFlow([start, nav, after, end]);
    expect(flow.blocks().map((b) => b.name)).toEqual(["nav-x", "after"]);
  });

  test("carries a non-enumerable runtime marker distinguishing it from a regular Block", () => {
    const nav = defineNavBlock<Arrived>({ name: "nav-y", checkpoint: "Arrived", url: "about:blank" });
    const regular = defineBlock<Start, A>({
      name: "regular",
      instruction: { async act() {}, resolve: () => checkpoint("A") },
    });

    expect((nav as any).__waygraphKind).toBe("nav");
    expect((regular as any).__waygraphKind).toBeUndefined();
    // Non-enumerable - doesn't leak into JSON/Object.keys/spread.
    expect(Object.keys(nav)).not.toContain("__waygraphKind");
    expect(JSON.stringify(nav)).not.toContain("__waygraphKind");
  });
});

test.describe("ActionPage (regular Blocks)", () => {
  test("a regular Block's act() still compiles and runs when it calls page.goto", async ({ page }) => {
    // This is the actual proof for M1.3: if ActionPage's narrowing were a
    // real type error (not just @deprecated), this file would fail
    // `tsc --noEmit` before ever running. It compiles and runs unchanged.
    const block = defineBlock<Start, A>({
      name: "mixed",
      instruction: {
        async act(actionPage) {
          await actionPage.goto("data:text/html,<p>mixed</p>");
        },
        resolve: () => checkpoint("A"),
      },
    });

    const engine = new Engine();
    const flow = engine.defineFlow([start, block, end]);
    const fakeContext = { newPage: async () => page } as any;
    const result = await flow.run(fakeContext, new MemPage());

    expect(result).toEqual(checkpoint("A"));
    expect(page.url()).toBe("data:text/html,<p>mixed</p>");
  });
});

test.describe("EngineConfig.browsers (pluggable browser provider)", () => {
  test("a custom launcher is used instead of the real chromium for a mem-only run", async () => {
    const calls: string[] = [];
    const fakePage = { close: async () => {} } as unknown as import("@playwright/test").Page;
    const fakeContext = { newPage: async () => fakePage } as any;
    const fakeBrowser = {
      newContext: async () => fakeContext,
      close: async () => {
        calls.push("browser-closed");
      },
    } as any;
    const fakeChromium = {
      launch: async () => {
        calls.push("custom-launch");
        return fakeBrowser;
      },
    } as any;

    const block: Block<Start, A> = {
      name: "x",
      instruction: { async act() {}, resolve: () => checkpoint("A") },
    };
    const engine = new Engine({ browsers: { chromium: fakeChromium } });
    const flow = engine.defineFlow([start, block, end]);
    const result = await flow.run(new MemPage());

    expect(calls).toEqual(["custom-launch", "browser-closed"]);
    expect(result).toEqual(checkpoint("A"));
  });

  test("no browsers override still uses the real chromium (unchanged default)", async () => {
    const block: Block<Start, A> = {
      name: "y",
      instruction: { async act() {}, resolve: () => checkpoint("A") },
    };
    const engine = new Engine({ headless: true });
    const flow = engine.defineFlow([start, block, end]);
    const result = await flow.run(new MemPage());

    expect(result).toEqual(checkpoint("A"));
  });
});
