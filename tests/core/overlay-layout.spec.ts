import { test, expect, type Page } from "@playwright/test";
import { installOverlay } from "../../dist/demo/overlay/overlay.js";
import { recordNetworkEntry } from "../../dist/demo/overlay/network-capture.js";
import { renderBeforeStep } from "../../dist/demo/stepper/panel-before.js";

/** Everything the demo can show at once: banner, todo dock, caption, typing chip, step panel, zoom, network, device. */
async function showAllChrome(page: Page): Promise<void> {
  await page.setContent(`<main style="padding:40px;font:16px system-ui"><h1>Products</h1>${"<p>Item</p>".repeat(40)}</main>`);
  await installOverlay(page, "Checkout - happy path", null, "Fill in the username from the test data", true);
  await recordNetworkEntry(page, { method: "POST", url: "https://example.test/api/login", status: 200, ok: true, ms: 41 });
  await renderBeforeStep(page, {
    index: 1, total: 6, blockName: "fill-username", description: "Types the username from mem into the login form.",
    keys: [{ name: "saucedemo.credentials", value: '{"username":"standard_user"}' }],
    allNames: ["nav-login", "fill-username", "fill-password", "submit-login"], moduleIndex: 1, justEnteredEpisode: false,
    title: "Checkout - happy path", caption: "Fill in the username from the test data", networkTabVisible: true,
    todos: [], todoSync: "keep",
  });
  await page.evaluate(() => {
    window.__wgSetTypingBadge?.(true, "from mem: saucedemo.credentials");
    window.__wgSyncTodos?.({ sync: "set", list: [{ text: "Open login", done: true }, { text: "Type username", current: true }, { text: "Type password" }, { text: "Submit" }] });
    window.__wgSyncDevice?.({ sync: "set", device: { preset: "mobile", touchMode: true, viewport: { width: 390, height: 844 } }, announce: false });
  });
  await page.waitForTimeout(500); // fades
}

/** The on-screen box of each piece of chrome that is showing. */
async function chromeBoxes(page: Page): Promise<{ id: string; x: number; y: number; w: number; h: number }[]> {
  return page.evaluate(() => {
    const ids = ["wg-banner", "wg-todo-dock", "wg-caption-bar", "wg-typing-badge", "wg-panel", "wg-zoom-badge", "wg-network-log", "wg-device-badge"];
    return ids.flatMap((id) => {
      const el = (globalThis as { __wgById?: (id: string) => HTMLElement | null }).__wgById?.(id);
      if (!el) return [];
      // The caption bar's visible part is its card.
      const shown = id === "wg-caption-bar" ? (el.querySelector(".wg-caption-text") as HTMLElement) : el;
      const r = shown.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (style.display === "none" || r.width === 0 || r.height === 0) return [];
      return [{ id, x: r.x, y: r.y, w: r.width, h: r.height }];
    });
  });
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 640 }, { width: 390, height: 844 }]) {
  test(`overlay chrome never overlaps and stays on screen (${viewport.width}x${viewport.height})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await showAllChrome(page);
    const boxes = await chromeBoxes(page);
    await page.screenshot({ path: test.info().outputPath("overlay.png") });
    expect(boxes.map((b) => b.id)).toEqual(expect.arrayContaining(["wg-banner", "wg-todo-dock", "wg-caption-bar", "wg-typing-badge", "wg-panel", "wg-zoom-badge", "wg-network-log"]));
    for (const b of boxes) {
      expect(b.x, `${b.id} left edge`).toBeGreaterThanOrEqual(0);
      expect(b.y, `${b.id} top edge`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w, `${b.id} right edge`).toBeLessThanOrEqual(viewport.width + 0.5);
      expect(b.y + b.h, `${b.id} bottom edge`).toBeLessThanOrEqual(viewport.height + 0.5);
    }
    const overlaps: string[] = [];
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps.push(`${a.id} x ${b.id}`);
      }
    }
    expect(overlaps).toEqual([]);
  });
}

test("a dock or banner a ring lands on moves to the other side's slot", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await showAllChrome(page);
  const slotOf = (id: string) => page.evaluate((i) => (globalThis as { __wgById?: (id: string) => HTMLElement | null }).__wgById?.(i)?.parentElement?.dataset.slot, id);
  expect(await slotOf("wg-todo-dock")).toBe("left");
  expect(await slotOf("wg-banner")).toBe("top-left");
  const dock = await page.evaluate(() => (globalThis as { __wgById?: (id: string) => HTMLElement | null }).__wgById!("wg-todo-dock")!.getBoundingClientRect().toJSON());
  const banner = await page.evaluate(() => (globalThis as { __wgById?: (id: string) => HTMLElement | null }).__wgById!("wg-banner")!.getBoundingClientRect().toJSON());
  await page.evaluate(([d, b]) => {
    window.__wgTodosAvoidRingCollision?.({ x: d.x + 10, y: d.y + 10, width: 40, height: 20 });
    window.__wgBannerAvoidRing?.({ x: b.x + 10, y: b.y + 5, width: 40, height: 20 });
  }, [dock, banner] as const);
  await expect.poll(() => slotOf("wg-todo-dock")).toBe("right");
  expect(await slotOf("wg-banner")).not.toBe("top-left");
});

test("the overlay never takes a click meant for the page: a button under the todo dock is clicked through it", async ({ page }) => {
  const { setLocatorTheater } = await import("../../dist/demo/overlay/locator-theater.js");
  const { setActing } = await import("../../dist/demo/overlay/acting.js");
  await page.setViewportSize({ width: 1280, height: 720 });
  await showAllChrome(page);
  // A page button exactly where the dock sits.
  const dock = await page.evaluate(() => (globalThis as { __wgById?: (id: string) => HTMLElement | null }).__wgById!("wg-todo-dock")!.getBoundingClientRect().toJSON());
  await page.evaluate((d) => {
    const b = document.createElement("button");
    b.id = "under";
    b.textContent = "Save";
    b.style.cssText = `position:fixed;left:${d.x + 20}px;top:${d.y + 20}px;width:120px;height:32px`;
    b.onclick = () => (b.textContent = "clicked");
    document.body.appendChild(b);
  }, dock);
  const hit = (x: number, y: number) => page.evaluate(([x, y]) => {
    const top = document.elementFromPoint(x, y);
    return top?.id === "wg-root" ? "overlay" : (top as HTMLElement | null)?.id ?? "";
  }, [x, y] as const);
  const at = [dock.x + 60, dock.y + 36] as const;
  await expect.poll(() => hit(...at)).toBe("overlay"); // the dock covers it

  setLocatorTheater(page, { beforeFill: async () => {}, typingDelay: () => 0, afterFill: async () => {}, beforeClick: async () => "click", holdMs: () => 0, afterClick: async () => {} });
  await page.locator("#under").click();
  await expect(page.locator("#under")).toHaveText("clicked");
  await expect.poll(() => hit(...at)).toBe("overlay"); // the dock takes clicks again once the click is done

  await setActing(page, true); // a step acting: the whole chrome lets clicks through
  await expect.poll(() => hit(...at)).toBe("under");
  await setActing(page, false);
  await expect.poll(() => hit(...at)).toBe("overlay");
});
