import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { installDemoChrome } from "../../dist/demo/overlay/auto-chrome.js";
import { keepOverlayOnNavigation, repaintOverlay } from "../../dist/demo/overlay/reattach.js";

test("the overlay comes back after a navigation nobody clicked (a JS redirect), once the redirect settles", async ({ page }) => {
  const server = createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    if (req.url === "/start") res.end(`<p>start</p><script>setTimeout(() => (location.href = "/hop"), 300)</script>`);
    else if (req.url === "/hop") res.end(`<p>hop</p><script>location.replace("/landed")</script>`);
    else res.end(`<h1>landed</h1>`);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    let repaints = 0;
    await page.goto(base + "/start");
    await installDemoChrome(page, "Redirects");
    keepOverlayOnNavigation(page, async () => {
      repaints += 1;
      await installDemoChrome(page, "Redirects");
    });
    await expect(page.locator("#wg-banner")).toHaveCount(1);

    await page.waitForURL("**/landed");
    await expect(page.getByRole("heading", { name: "landed" })).toBeVisible();
    await expect(page.locator("#wg-banner")).toHaveCount(1);
    await expect(page.locator("#wg-ring")).toHaveCount(1);
    // start -> hop -> landed is one burst of loads; it repainted once it settled, not once per hop
    expect(repaints).toBeLessThanOrEqual(2);

    // on demand, repaints run one after another
    await Promise.all([repaintOverlay(page), repaintOverlay(page)]);
    await expect(page.locator("#wg-banner")).toHaveCount(1);
  } finally {
    server.close();
  }
});
