import { test, expect, type Page } from "@playwright/test";
import { checkpoint, defineMethodBlock, Engine, MemPage, type Trait } from "../../src/index.js";

const Start = checkpoint("__start__");
const Results = checkpoint("Results");

/** A debounced search: the list fills in three bursts, 250ms apart. */
async function typeSearch(page: Page): Promise<void> {
  await page.setContent(`<ul id="rows"></ul><script>
    [1, 2, 3].forEach((n) => setTimeout(() => { const li = document.createElement("li"); li.textContent = "row " + n; document.getElementById("rows").append(li); }, n * 250));
  </script>`);
}
/** Three rows, checked once (no retry): only a settled page passes. */
const threeRows: Trait = { name: "three-rows", timeoutMs: 0, async check(page) { return (await page.locator("#rows li").count()) === 3; } };
const search = defineMethodBlock({ name: "search", from: Start, to: Results, instruction: { act: typeSearch, verify: [threeRows] } });
const engine = new Engine();

test("without settle, a check right after the step sees the page mid-render", async ({ page }) => {
  await expect(engine.map().method(search).end().run(page.context(), new MemPage(), { page })).rejects.toThrow(/three-rows/);
});

test("settle waits until the page stops changing, then the step is checked", async ({ page }) => {
  expect(await engine.map().method(search, { settle: true }).end().run(page.context(), new MemPage(), { page })).toEqual(Results);
});
