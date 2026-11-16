import { test, expect } from "@playwright/test";
import { installOverlay } from "../../dist/demo/overlay/overlay.js";
import { renderBeforeStep } from "../../dist/demo/stepper/panel-before.js";

const names = Array.from({ length: 60 }, (_, i) => `step-number-${i + 1}-with-a-long-name`);

async function step(page: import("@playwright/test").Page, index: number) {
  await renderBeforeStep(page, {
    index, total: names.length, blockName: names[index] ?? "", expects: [], description: "", keys: [], allNames: names, moduleIndex: index, justEnteredEpisode: false,
    title: "A long flow", todos: [], todoSync: "keep",
  });
}

const scrollOf = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const list = (globalThis as { __wgById?: (id: string) => HTMLElement | null }).__wgById?.("wg-modules");
    const current = list?.querySelector<HTMLElement>(".wg-mod-current");
    if (!list || !current) return null;
    const box = list.getBoundingClientRect();
    const at = current.getBoundingClientRect();
    return { left: list.scrollLeft, visible: at.left >= box.left - 1 && at.right <= box.right + 1 };
  });

test("the step list keeps its scroll from step to step, moving only as far as the current step needs", async ({ page }) => {
  await page.setContent("<main><h1>Long flow</h1></main>");
  await installOverlay(page, "A long flow", null, undefined, false);
  await step(page, 0);
  expect((await scrollOf(page))?.left).toBe(0);
  await step(page, 40);
  const far = await scrollOf(page);
  expect(far?.visible).toBe(true);
  expect(far?.left).toBeGreaterThan(300);
  await step(page, 41);
  const next = await scrollOf(page);
  expect(next?.visible).toBe(true);
  // One chip further, not back to the start: it moved by about a chip's width, no more.
  expect(next!.left).toBeGreaterThanOrEqual(far!.left);
  expect(next!.left - far!.left).toBeLessThan(400);
});
