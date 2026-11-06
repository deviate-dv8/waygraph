import { test, expect, type Page } from "@playwright/test";
import { installOverlay } from "../../dist/demo/overlay/overlay.js";

// A ring over the todo dock moves the dock to the other side, so the dock never hides what the demo points at. The
// demo re-syncs the dock all the time (each ring, each panel); that must not put it back over the ring.

const dockState = (pos: string) => ({ id: "case", pos, title: "Add a machine", groups: [{ id: "g", style: "sequential", items: [{ text: "Open" }, { text: "Save" }] }] });

async function dock(page: Page) {
  return page.evaluate(() => {
    const el = (window.__wgRoot!() as ShadowRoot).querySelector(".wg-todo-dock") as HTMLElement;
    const r = el.getBoundingClientRect();
    return { pos: el.dataset.pos, slot: el.parentElement?.dataset.slot, left: Math.round(r.left), top: Math.round(r.top) };
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(`<main style="padding:40px"><button id="save">Save</button></main>`);
  await installOverlay(page, "Todo dock");
  // As the ring cycle first paints it: the dock's state, its side inside.
  await page.evaluate((d) => window.__wgSyncTodos?.({ sync: "set", dock: d }), dockState("left"));
});

test("a ring over the todo dock moves the dock to the other side", async ({ page }) => {
  const before = await dock(page);
  await page.evaluate((b) => window.__wgPositionRing?.({ x: b.left + 10, y: b.top + 10, width: 80, height: 30 }, "Save", "planned", {}), before);
  const after = await dock(page);
  expect(after.pos).toBe("right");
  expect(after.slot).toBe("right");
  expect(after.left - before.left).toBeGreaterThan(300);
});

test("a re-sync with the same side keeps the dock where it moved; a new side wins", async ({ page }) => {
  const before = await dock(page);
  await page.evaluate((b) => window.__wgPositionRing?.({ x: b.left + 10, y: b.top + 10, width: 80, height: 30 }, "Save", "planned", {}), before);
  // The panel and the ring cycle sync again, naming the side the narration asked for.
  await page.evaluate((d) => window.__wgSyncTodos?.({ sync: "set", dock: d, todoId: "case", pos: "left" }), dockState("left"));
  expect((await dock(page)).pos).toBe("right");
  // The narration moves it on purpose: that's where it goes.
  await page.evaluate((d) => window.__wgSyncTodos?.({ sync: "set", dock: d, todoId: "case", pos: "right" }), dockState("right"));
  await page.evaluate((d) => window.__wgSyncTodos?.({ sync: "set", dock: d, todoId: "case", pos: "left" }), dockState("left"));
  expect((await dock(page)).pos).toBe("left");
});
