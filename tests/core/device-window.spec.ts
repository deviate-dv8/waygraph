import { test, expect, chromium } from "@playwright/test";
import { applyDeviceToPage } from "../../dist/demo/overlay/device-stage.js";
import { resolveDeviceState } from "../../dist/demo/narration/device.js";
import { ensureShadowRoot } from "../../dist/demo/overlay/ui/shadow.js";

// A watched demo's window fills the screen (no fixed viewport): a device switch draws the device inside the page and
// leaves the window as it is - it never shrinks it to a default size.
test("a device switch in a window-sized demo keeps the window's size", async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();
    await page.setContent("<h1>App</h1>");
    await ensureShadowRoot(page);
    const before = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    await applyDeviceToPage(page, resolveDeviceState("mobile"), "set");
    expect(page.viewportSize()).toBeNull();
    expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(before);
    expect(await page.evaluate(() => !!document.getElementById("wg-device-shell"))).toBe(true);
    await applyDeviceToPage(page, resolveDeviceState("desktop"), "clear");
    expect(page.viewportSize()).toBeNull();
    expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(before);
  } finally {
    await browser.close();
  }
});
