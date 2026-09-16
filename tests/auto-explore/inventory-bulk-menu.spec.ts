import { test, expect, chromium } from "@playwright/test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExploreContext, buildExploreMenu } from "../../src/auto-explore.js";
import { MemPage, Engine, start, end } from "../../src/index.js";

const sauceRoot = join(dirname(fileURLToPath(import.meta.url)), "../../examples/saucedemo");

function memSet(mem: MemPage, k: unknown, value: unknown) {
  (mem as unknown as { store: Map<unknown, unknown> }).store.set(k, value);
}

test("auto menu on inventory shows per-item + bulk add/remove", async () => {
  test.setTimeout(120_000);
  const { graph, library } = await buildExploreContext(sauceRoot);
  const mem = new MemPage();

  const exe = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
  const browser = await chromium.launch({
    headless: true,
    ...(exe ? { executablePath: exe, args: ["--no-sandbox"] } : {}),
  });
  const context = await browser.newContext({
    baseURL: "https://www.saucedemo.com",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  // Login via the live form (avoid MemKey identity across package copies).
  await page.goto("/", { waitUntil: "load" });
  await page.locator("#user-name").fill("standard_user");
  await page.locator("#password").fill("secret_sauce");
  await page.locator("#login-button").click();
  await page.waitForURL(/inventory\.html/);

  const menu1 = await buildExploreMenu(page, graph, library, "LoggedIn");
  console.log("\n=== AFTER LOGIN (cart empty) ===");
  for (const sec of menu1.sections) {
    console.log(`\n[${sec.title}]`);
    for (const e of sec.edges) {
      console.log(`  • ${e.label ?? `${e.block} -> ${e.to}`}`);
    }
  }

  const labels1 = menu1.flat.map((e) => e.label ?? `${e.block} -> ${e.to}`);
  expect(labels1).toContain("Add all to cart");
  expect(labels1.filter((l) => /^Add "/.test(l ?? "")).length).toBeGreaterThanOrEqual(2);
  expect(labels1).not.toContain("Remove all from cart");

  // Add bike light via DOM so Remove rows appear (same as picking that auto row).
  await page.locator('[data-test="add-to-cart-sauce-labs-bike-light"]').click();

  const menu2 = await buildExploreMenu(page, graph, library, "LoggedIn");
  console.log("\n=== AFTER ADD BIKE LIGHT (mixed) ===");
  for (const sec of menu2.sections) {
    console.log(`\n[${sec.title}]`);
    for (const e of sec.edges) {
      console.log(`  • ${e.label ?? `${e.block} -> ${e.to}`}`);
    }
  }

  const labels2 = menu2.flat.map((e) => e.label ?? `${e.block} -> ${e.to}`);
  expect(labels2).toContain("Remove all from cart");
  expect(labels2).toContain("Add all to cart");
  expect(labels2.some((l) => /Remove "Sauce Labs Bike Light"/i.test(l ?? ""))).toBeTruthy();

  void mem;
  void Engine;
  void start;
  void end;
  void memSet;
  await browser.close();
});
