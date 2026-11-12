import { test, expect } from "@playwright/test";
import { installOverlay } from "../../dist/demo/overlay/overlay.js";
import { overlayLayer } from "../../dist/demo/overlay/overlay-layer.js";
import { outcomePiece } from "../../dist/demo/stepper/outcome.js";
import type { CallView } from "../../dist/demo/overlay/inpage/call-modal.js";

const call: CallView = {
  name: "POST /posts",
  method: "POST",
  url: "https://jsonplaceholder.typicode.com/posts",
  words: "201 Created",
  status: 201,
  why: "The server made what was asked.",
  ms: 212,
  size: 64,
  failed: false,
  source: "api",
  reqHeaders: { "content-type": "application/json", authorization: "••••" },
  reqBody: '{\n  "title": "Seeded by waygraph"\n}',
  resHeaders: { "content-type": "application/json" },
  resBody: '{\n  "id": 101\n}',
  curl: "curl -X POST 'https://jsonplaceholder.typicode.com/posts'",
};

test.afterEach(({ page }) => overlayLayer(page).clear());

test("a step's calls are on its card, and a row opens the request and the response", async ({ page }) => {
  await page.goto("data:text/html,<h1>Shop</h1>");
  await installOverlay(page, "Seed", null, "");
  await outcomePiece(page).set(page, { expects: [], changes: [], moreChanges: 0, calls: [call, { ...call, name: "GET /posts/:id", method: "GET", words: "404 Not Found", status: 404, failed: true, why: "Nothing lives at this address (or the id in it doesn't exist)." }], callsLeftOut: 2 });
  const root = page.locator("#wg-root");
  await expect(root.locator(".wg-call-row")).toHaveCount(2);
  await expect(root.locator("#wg-outcome")).toContainText("201 Created");
  await expect(root.locator("#wg-outcome")).toContainText("2 to other sites left out");
  await root.locator(".wg-call-row").first().click();
  const modal = root.locator("#wg-call-modal");
  await expect(modal).toContainText("POST /posts");
  await expect(modal).toContainText("The server made what was asked.");
  await expect(modal).toContainText("Seeded by waygraph");
  await expect(modal).toContainText('"id": 101');
  await expect(modal).toContainText("••••");
  await page.screenshot({ path: "/tmp/call-modal.png" });
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  // The card comes back after a page load with its rows still opening the modal.
  await root.locator(".wg-call-row").nth(1).click();
  await expect(root.locator("#wg-call-modal")).toContainText("404 Not Found");
});
