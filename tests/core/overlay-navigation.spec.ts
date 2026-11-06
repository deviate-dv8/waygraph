import { test, expect, type Page } from "@playwright/test";
import { installOverlay } from "../../dist/demo/overlay/overlay.js";
import { keepOverlayOnNavigation } from "../../dist/demo/overlay/reattach.js";
import { overlayLayer } from "../../dist/demo/overlay/overlay-layer.js";
import { restoreTheaterAfterNavigation } from "../../dist/demo/stepper/teardown.js";
import { outcomePiece } from "../../dist/demo/stepper/outcome.js";

// A full page load (a link to another site, a redirect) wipes everything waygraph painted. What the overlay showed comes
// back from its layer: the banner's title, the caption, the step's outcome card - with no code of their own for it.

const page1 = "data:text/html,<h1>Page one</h1>";
const page2 = "data:text/html,<h1>Another site</h1>";

/** What the overlay shows, read from its shadow root. */
async function shown(page: Page) {
  return page.evaluate(() => {
    const root = document.getElementById("wg-root")?.shadowRoot;
    const text = (id: string) => (root?.getElementById(id)?.textContent ?? "").replace(/\s+/g, " ").trim() || null;
    return {
      banner: text("wg-banner"),
      caption: root?.getElementById("wg-caption-bar")?.classList.contains("wg-in") ? text("wg-caption-bar") : null,
      outcome: text("wg-outcome"),
      ticked: root?.querySelectorAll('#wg-outcome .wg-outcome-row[data-state="ok"]').length ?? 0,
    };
  });
}

test.afterEach(({ page }) => overlayLayer(page).clear());

test("the banner, the caption and the outcome card come back after a page load", async ({ page }) => {
  await page.goto(page1);
  // The demo's own wiring: on every load, repaint the overlay from its layer.
  keepOverlayOnNavigation(page, () => restoreTheaterAfterNavigation(page, { current: [] }));
  await installOverlay(page, "Checkout", null, "Paying through the provider");
  await outcomePiece(page).set(page, { expects: [{ text: "The order is placed", ok: true }], changes: [], moreChanges: 0 });
  expect(await shown(page)).toMatchObject({ caption: "Paying through the provider", outcome: expect.stringContaining("The order is placed") });

  await page.goto(page2);
  await expect.poll(() => shown(page)).toMatchObject({
    banner: expect.stringContaining("Checkout"),
    caption: "Paying through the provider",
    outcome: expect.stringContaining("The order is placed"),
    ticked: 1,
  });
});

test("a caption taken away stays away after a page load", async ({ page }) => {
  await page.goto(page1);
  keepOverlayOnNavigation(page, () => restoreTheaterAfterNavigation(page, { current: [] }));
  await installOverlay(page, "Checkout", null, "Paying through the provider");
  await installOverlay(page, undefined, null, "");
  await page.goto(page2);
  await expect.poll(() => shown(page)).toMatchObject({ banner: expect.stringContaining("Checkout") });
  expect((await shown(page)).caption).toBeNull();
});
