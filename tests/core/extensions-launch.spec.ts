import { test, expect, chromium } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchContext } from "../../src/browser.js";

function fakeExtension(): string {
  const dir = mkdtempSync(join(tmpdir(), "wg-fake-ext-"));
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      name: "Fake",
      version: "1",
      content_scripts: [{ matches: ["<all_urls>"], js: ["mark.js"] }],
    }),
  );
  writeFileSync(join(dir, "mark.js"), 'document.documentElement.dataset.fakeExt = "on";');
  return dir;
}

test("launchContext loads an unpacked extension headless", async () => {
  const server = createServer((_, res) => res.end("<html><body>hi</body></html>"));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const { context, close } = await launchContext({
    launcher: chromium,
    launch: { headless: true },
    extensions: [fakeExtension()],
  });
  try {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page.locator("html")).toHaveAttribute("data-fake-ext", "on");
  } finally {
    await close();
    server.close();
  }
});

test("without extensions it is a plain browser context", async () => {
  const { browser, context, close } = await launchContext({ launcher: chromium, launch: { headless: true } });
  try {
    expect(browser).not.toBeNull();
    expect(context.browser()).toBe(browser);
  } finally {
    await close();
  }
});
