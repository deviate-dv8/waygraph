// Headful demo: login, then show the live add-to-cart menu (one row per
// product still on the page), pick the bike light, prove that item lands in
// the cart. Browser stays open ~12s at each pause so you can eyeball it.
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
const { installDemoChrome } = await import(pathToFileURL(join(waygraphDist, "step-overlay.js")).href);

const exe = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
const pauseMs = Number(process.env.WG_SHOW_PAUSE_MS ?? 10_000);

async function runBlock(engine, entry, context, page, mem) {
  const flow = engine.defineFlow([start, entry.block, end]);
  await flow.run(context, mem, { page, closeOnFinish: false });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function paintMenu(page, menu) {
  const lines = [];
  lines.push(`<style>
    #wg-show{position:fixed;z-index:2147483647;left:50%;bottom:16px;transform:translateX(-50%);
      max-width:min(92vw,640px);max-height:70vh;overflow:auto;background:rgba(20,10,40,.95);color:#fff;
      border-radius:14px;padding:16px 20px;font:14px/1.4 system-ui,sans-serif;
      box-shadow:0 12px 30px rgba(0,0,0,.4)}
    #wg-show h3{margin:0 0 8px;font-size:16px}
    #wg-show .here{color:#c9a6ff;margin-bottom:10px}
    #wg-show .sec{margin:10px 0 6px;font-size:11px;font-weight:700;color:#a78bfa;text-transform:uppercase}
    #wg-show .row{display:block;margin:6px 0;padding:10px 12px;border-radius:10px;border:1px solid #5b3aa8;
      background:#2a1450;color:#fff}
    #wg-show .pick{border-color:#34d399;background:#14532d}
  </style>`);
  lines.push(`<div id="wg-show"><h3>waygraph auto — live menu</h3>`);
  lines.push(`<div class="here">You are here: <strong>${menu.here}</strong></div>`);
  for (const section of menu.sections) {
    lines.push(`<div class="sec">${section.title}</div>`);
    for (const e of section.edges) {
      const text = e.label ?? `${e.block} → ${e.to}`;
      const cls = e.block === "add-to-cart" ? "row pick" : "row";
      lines.push(`<div class="${cls}">${text.replace(/</g, "&lt;")}</div>`);
    }
  }
  lines.push(`</div>`);
  const html = lines.join("");
  await page.evaluate((inner) => {
    let el = document.getElementById("wg-show");
    if (!el) {
      el = document.createElement("div");
      document.documentElement.appendChild(el);
    }
    el.outerHTML = inner;
  }, html);
}

const { graph, library } = await buildExploreContext(root);
const mem = new MemPage();
mem.set(library.byName.get("submit-login").block.requires[0], {
  username: "standard_user",
  password: "secret_sauce",
});

const browser = await chromium.launch({
  headless: false,
  slowMo: 200,
  args: ["--start-maximized"],
  ...(exe ? { executablePath: exe } : {}),
});
const context = await browser.newContext({
  baseURL: "https://www.saucedemo.com",
  viewport: null,
});
const page = await context.newPage();
const engine = new Engine({ headless: false, slowMo: 200 });

await page.goto("/", { waitUntil: "load" });
await installDemoChrome(page, "show add-to-cart menu", { banner: false });

console.error("SHOW: logging in…");
await runBlock(engine, library.byName.get("submit-login"), context, page, mem);
await page.waitForURL(/inventory\.html/);

const menu1 = await buildExploreMenu(page, graph, library, "LoggedIn");
const addRows = menu1.flat.filter((e) => e.block === "add-to-cart");
console.error(`SHOW: ${addRows.length} add-to-cart rows (one per product still addable):`);
for (const r of addRows) console.error(`  - ${r.label}`);

await paintMenu(page, menu1);
console.error(`SHOW: look at the purple panel — pause ${pauseMs / 1000}s`);
await sleep(pauseMs);

const bike = addRows.find((r) => r.instanceOption?.value?.id === "sauce-labs-bike-light");
if (!bike) throw new Error("bike light row missing");
mem.set(bike.instanceOption.key, bike.instanceOption.value);
console.error(`SHOW: picking → ${bike.label}`);
await runBlock(engine, library.byName.get("add-to-cart"), context, page, mem);

const menu2 = await buildExploreMenu(page, graph, library, "LoggedIn");
await paintMenu(page, menu2);
const stillBike = menu2.flat.some(
  (e) => e.block === "add-to-cart" && e.instanceOption?.value?.id === "sauce-labs-bike-light",
);
console.error(
  `SHOW: bike light in cart (Remove button visible), menu no longer offers it: ${!stillBike}`,
);
console.error(`SHOW: pause ${pauseMs / 1000}s then closing`);
await sleep(pauseMs);

await browser.close();
console.error("SHOW: done");
