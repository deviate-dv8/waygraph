import { chromium } from "@playwright/test";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
await import(require.resolve("tsx/esm"));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "../../.tmp/waygraph-auto");
const waygraphDist = join(root, "../../dist");

const { buildExploreContext, buildExploreMenu } = await import(
  pathToFileURL(join(waygraphDist, "auto-explore.js")).href
);
const { locate, MemPage, Engine, start, end } = await import(pathToFileURL(join(waygraphDist, "index.js")).href);

const exe = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;

async function snap(page, name) {
  const path = join(outDir, `graph-proof-${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log("screenshot", path);
}

async function resolveHere(page, navTags) {
  const path = new URL(page.url()).pathname;
  if (path.includes("inventory-item.html")) return "ItemDetailPage";
  if (path.includes("inventory.html")) return "LoggedIn";
  if (path.includes("cart.html")) return "CartPage";
  if (path.includes("checkout-complete.html")) return "OrderComplete";
  if (path === "/" || path === "") {
    if (await page.locator("#login-button").isVisible({ timeout: 500 }).catch(() => false)) return "LoginPage";
  }
  return locate(page, navTags, { timeoutMs: 1500 });
}

async function menuSummary(page, graph, library, label) {
  const navTags = library.navBlocks.map((n) => n.block);
  const resolved = await resolveHere(page, navTags);
  const menu = await buildExploreMenu(page, graph, library, resolved);
  console.log(`\n=== ${label} | here=${resolved} ===`);
  for (const s of menu.sections) {
    console.log(`  ${s.title}:`);
    for (const e of s.edges) console.log(`    ${e.block} (${e.kind}) → ${e.to}`);
  }
  return resolved;
}

async function runBlock(engine, entry, context, page, mem) {
  const flow = engine.defineFlow([start, entry.block, end]);
  await flow.run(context, mem, { page, closeOnFinish: false });
}

const { graph, library } = await buildExploreContext(root);
const mem = new MemPage();
mem.set(
  library.byName.get("submit-login").block.requires[0],
  { username: "standard_user", password: "secret_sauce" },
);

const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe, args: ["--no-sandbox"] } : {}),
});
const context = await browser.newContext({ baseURL: "https://www.saucedemo.com", viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const engine = new Engine({ headless: true });

await page.goto("/", { waitUntil: "load" });
await menuSummary(page, graph, library, "1. Login page");
await snap(page, "1-login-menu");

await runBlock(engine, library.byName.get("submit-login"), context, page, mem);
await page.waitForURL(/inventory\.html/);
const here2 = await menuSummary(page, graph, library, "2. After submit-login → LoggedIn");
if (here2 !== "LoggedIn") throw new Error(`expected LoggedIn got ${here2}`);
await snap(page, "2-logged-in-menu");

const logout = library.byName.get("submit-logout");
const hasLogout = (await buildExploreMenu(page, graph, library, "LoggedIn")).flat.some((e) => e.block === "submit-logout");
if (!hasLogout) throw new Error("graph menu missing submit-logout on LoggedIn");

await runBlock(engine, logout, context, page, mem);
await page.waitForSelector("#login-button");
const here3 = await menuSummary(page, graph, library, "3. After submit-logout → LoginPage");
if (here3 !== "LoginPage") throw new Error(`expected LoginPage got ${here3}`);
await snap(page, "3-back-to-login-menu");

console.log("\nPASS: graph cycle LoginPage → LoggedIn → LoginPage");
await browser.close();
