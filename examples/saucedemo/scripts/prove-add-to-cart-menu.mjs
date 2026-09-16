// Proves the dynamic add-to-cart menu for real: buildExploreMenu must offer
// one row PER item still on the page (not one generic "add-to-cart" row tied
// to the backpack), picking a non-default item must add THAT item (not the
// backpack), and the menu must stop offering an item once it is in the cart.
import { chromium } from "@playwright/test";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
await import(require.resolve("tsx/esm"));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const waygraphDist = join(root, "../../dist");

const { buildExploreContext, buildExploreMenu } = await import(
  pathToFileURL(join(waygraphDist, "auto-explore.js")).href
);
const { MemPage, Engine, start, end } = await import(pathToFileURL(join(waygraphDist, "index.js")).href);

const exe = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;

async function runBlock(engine, entry, context, page, mem) {
  const flow = engine.defineFlow([start, entry.block, end]);
  await flow.run(context, mem, { page, closeOnFinish: false });
}

const { graph, library } = await buildExploreContext(root);
const mem = new MemPage();
mem.set(library.byName.get("submit-login").block.requires[0], {
  username: "standard_user",
  password: "secret_sauce",
});

const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe, args: ["--no-sandbox"] } : {}),
});
const context = await browser.newContext({
  baseURL: "https://www.saucedemo.com",
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();
const engine = new Engine({ headless: true });

await page.goto("/", { waitUntil: "load" });
await runBlock(engine, library.byName.get("submit-login"), context, page, mem);
await page.waitForURL(/inventory\.html/);

// 1. Menu on LoggedIn must offer one distinct add-to-cart row per product on
// the inventory page - not a single generic row.
const menu1 = await buildExploreMenu(page, graph, library, "LoggedIn");
const addRows1 = menu1.flat.filter((e) => e.block === "add-to-cart");
console.log(`add-to-cart rows on LoggedIn: ${addRows1.length}`);
for (const row of addRows1) console.log(`  - ${row.label}`);
if (addRows1.length < 2) {
  throw new Error(`expected several distinct add-to-cart rows, got ${addRows1.length}`);
}
if (addRows1.some((r) => !r.instanceOption)) {
  throw new Error("every add-to-cart row must carry an instanceOption");
}
const backpackRow = addRows1.find((r) => r.instanceOption.value.id === "sauce-labs-backpack");
const bikeLightRow = addRows1.find((r) => r.instanceOption.value.id === "sauce-labs-bike-light");
if (!backpackRow || !bikeLightRow) {
  throw new Error("expected both the backpack and the bike light as separate rows");
}
if (backpackRow.label === bikeLightRow.label) {
  throw new Error("rows must have distinct, item-specific labels");
}

// 2. Picking the NON-default item (bike light, not the backpack) must add
// exactly that item - proving mem really drives which product act() clicks.
mem.set(bikeLightRow.instanceOption.key, bikeLightRow.instanceOption.value);
await runBlock(engine, library.byName.get("add-to-cart"), context, page, mem);

const bikeLightInCart = await page.locator('[data-test="remove-sauce-labs-bike-light"]').first().isVisible();
const backpackStillInCart = await page.locator('[data-test="remove-sauce-labs-backpack"]').first().isVisible();
console.log(`bike light in cart: ${bikeLightInCart}, backpack in cart (should be false): ${backpackStillInCart}`);
if (!bikeLightInCart) throw new Error("expected the picked item (bike light) to be in the cart");
if (backpackStillInCart) throw new Error("backpack should NOT be in the cart - it was never picked");

// 3. Rebuilding the menu must now offer bike light's "Remove" row instead,
// and drop it from the add-to-cart options - the menu reflects the live page.
const menu2 = await buildExploreMenu(page, graph, library, "LoggedIn");
const addRows2 = menu2.flat.filter((e) => e.block === "add-to-cart");
if (addRows2.some((r) => r.instanceOption.value.id === "sauce-labs-bike-light")) {
  throw new Error("bike light should no longer be offered - it is already in the cart");
}
if (!addRows2.some((r) => r.instanceOption.value.id === "sauce-labs-backpack")) {
  throw new Error("backpack should still be offered - it was never added");
}
console.log(`add-to-cart rows after adding bike light: ${addRows2.length} (one fewer than before)`);
if (addRows2.length !== addRows1.length - 1) {
  throw new Error(`expected exactly one fewer row (${addRows1.length - 1}), got ${addRows2.length}`);
}

// 4. Same rebuild must now offer Remove for the bike light (mem branch for
// items already in the cart) - not only shrink the Add list.
const removeRows = menu2.flat.filter((e) => e.block === "remove-from-cart");
console.log(`remove-from-cart rows after add: ${removeRows.length}`);
for (const row of removeRows) console.log(`  - ${row.label}`);
if (removeRows.length !== 1) {
  throw new Error(`expected exactly 1 Remove row (bike light), got ${removeRows.length}`);
}
if (removeRows[0].instanceOption.value.id !== "sauce-labs-bike-light") {
  throw new Error(`expected Remove for bike light, got ${removeRows[0].label}`);
}
if (!/Remove "Sauce Labs Bike Light" from cart/.test(removeRows[0].label)) {
  throw new Error(`unexpected Remove label: ${removeRows[0].label}`);
}

// 5. MemNav: Open "…" details for every inventory card (including ones already
// in the cart) - separate from Add/Remove effect rows.
const openRows = menu2.flat.filter((e) => e.block === "nav-item-detail");
console.log(`nav-item-detail (MemNav) rows: ${openRows.length}`);
for (const row of openRows) console.log(`  - ${row.label}`);
if (openRows.length < 6) {
  throw new Error(`expected 6 Open details rows, got ${openRows.length}`);
}
if (!openRows.some((r) => /Open "Test\.allTheThings\(\) T-Shirt \(Red\)" details/.test(r.label))) {
  throw new Error("missing Open details row for Test.allTheThings() T-Shirt (Red)");
}

console.log("\nPASS: add/remove Effect + open-details MemNav reflect the live page");
await browser.close();
