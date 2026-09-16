// Dump waygraph auto menu sections on inventory (incl. bulk add/remove-all).
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
const { MemPage, Engine, start, end } = await import(
  pathToFileURL(join(waygraphDist, "index.js")).href
);

const exe = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;

async function runBlock(engine, entry, context, page, mem) {
  const flow = engine.defineFlow([start, entry.block, end]);
  await flow.run(context, mem, { page, closeOnFinish: false });
}

function dump(title, menu) {
  console.log(`\n=== ${title} (here=${menu.here}) ===`);
  for (const sec of menu.sections) {
    console.log(`\n[${sec.title}]`);
    for (const e of sec.edges) {
      const label = e.label ?? `${e.block} -> ${e.to}`;
      console.log(`  • ${label}`);
    }
  }
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

const menu1 = await buildExploreMenu(page, graph, library, "LoggedIn");
dump("AFTER LOGIN — cart empty", menu1);

const bike = menu1.flat.find(
  (e) => e.block === "add-to-cart" && e.instanceOption?.value?.id === "sauce-labs-bike-light",
);
mem.set(bike.instanceOption.key, bike.instanceOption.value);
await runBlock(engine, library.byName.get("add-to-cart"), context, page, mem);

const menu2 = await buildExploreMenu(page, graph, library, "LoggedIn");
dump("AFTER ADD BIKE LIGHT — mixed", menu2);

await browser.close();
