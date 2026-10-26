import { test, expect, type Page } from "@playwright/test";
import { installOverlay } from "../../dist/demo/overlay/overlay.js";
import { recordNetworkEntry } from "../../dist/demo/overlay/network-capture.js";

const PAGE = (title: string) => `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1></body></html>`;

async function serve(page: Page): Promise<void> {
  await page.route("http://wg.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ contentType: "text/html", body: PAGE(path.slice(1) || "home") });
  });
}

/** Every animation frame, notes whether the network panel was painted visible. */
async function probeFlashes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __wgNetSeenVisible?: boolean };
    const tick = () => {
      const byId = (globalThis as { __wgById?: (id: string) => HTMLElement | null }).__wgById;
      const el = typeof byId === "function" ? byId("wg-network-log") : null;
      if (el && Number(getComputedStyle(el).opacity) > 0) w.__wgNetSeenVisible = true;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const seenVisible = (page: Page) => page.evaluate(() => (window as unknown as { __wgNetSeenVisible?: boolean }).__wgNetSeenVisible === true);
const entry = { method: "GET", url: "http://wg.test/api/items", status: 200, ok: true, ms: 12 };

test.describe("network tab", () => {
  test("a hidden tab never paints when a navigation rebuilds it", async ({ page }) => {
    await serve(page);
    await probeFlashes(page);
    await page.goto("http://wg.test/a");
    await installOverlay(page, "network");
    await recordNetworkEntry(page, entry);
    await page.goto("http://wg.test/b");
    await installOverlay(page, "network");
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await seenVisible(page)).toBe(false);
  });

  test("a shown tab stays shown across a navigation, with its history", async ({ page }) => {
    await serve(page);
    await page.goto("http://wg.test/a");
    await installOverlay(page, "network", null, undefined, true);
    await recordNetworkEntry(page, entry);
    await page.goto("http://wg.test/b");
    await installOverlay(page, "network");
    const panel = page.locator("#wg-network-log");
    await expect(panel).toHaveClass(/wg-in/);
    // The captured call, then the navigation to /b itself (a document request is captured too).
    await expect(panel.locator(".wg-net-path")).toHaveText(["/api/items", "/b"]);
  });

  test("hideNetworkTab hides it on the next step", async ({ page }) => {
    await serve(page);
    await page.goto("http://wg.test/a");
    await installOverlay(page, "network", null, undefined, true);
    await recordNetworkEntry(page, entry);
    await installOverlay(page, "network", null, undefined, false);
    await expect(page.locator("#wg-network-log")).toHaveClass(/wg-out/);
  });
});
