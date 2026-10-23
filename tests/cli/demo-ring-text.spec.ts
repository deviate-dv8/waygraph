import { test, expect } from "@playwright/test";
import { installDemoChrome } from "../../dist/demo/overlay/auto-chrome.js";

test("the demo ring's caption is not DOM text, so the page's text selectors match only the page", async ({ page }) => {
  await page.setContent('<button id="go">Browser extension: v1</button>');
  await installDemoChrome(page, "", { banner: false });
  await page.evaluate(() => {
    const box = document.querySelector("#go")!.getBoundingClientRect();
    (window as unknown as { __wgPositionRing: (b: unknown, l: string) => void }).__wgPositionRing(
      { x: box.x, y: box.y, width: box.width, height: box.height },
      "Browser extension: v1",
    );
  });
  await expect(page.locator("#wg-ring-label")).toHaveAttribute("data-label", "Browser extension: v1");
  expect(await page.getByText("Browser extension: v1").count()).toBe(1);
  expect(await page.locator("text=/Browser extension: v/").count()).toBe(1);
  // still drawn: the pseudo-element gives the label its size
  expect((await page.locator("#wg-ring-label").boundingBox())?.width ?? 0).toBeGreaterThan(40);
});
