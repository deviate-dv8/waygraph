import { chromium } from "@playwright/test";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tsxEsm = require.resolve("tsx/esm");
await import(tsxEsm);

const { buildExploreContext, buildExploreMenu } = await import(
  pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "../../../dist/auto-explore.js")).href
);
const { locate } = await import(
  pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "../../../dist/index.js")).href
);

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(projectDir, "../../.tmp/waygraph-auto");
const exe = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;

const PANEL_CSS =
  "#wg-auto-panel{position:fixed;z-index:2147483647;left:50%;bottom:12px;transform:translateX(-50%);" +
  "max-width:min(92vw,720px);max-height:calc(100vh - 24px);overflow-y:auto;box-sizing:border-box;" +
  "background:rgba(20,10,40,.94);color:#fff;border-radius:14px;padding:16px 20px;" +
  "font:14px/1.4 system-ui,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.35);}" +
  "#wg-auto-panel h3{margin:0 0 10px;font-size:16px;}" +
  "#wg-auto-panel .wg-here{color:#c9a6ff;margin-bottom:12px;}" +
  "#wg-auto-panel .wg-actions{display:flex;flex-direction:column;gap:8px;}" +
  "#wg-auto-panel button.wg-act{text-align:left;padding:10px 12px;border-radius:10px;border:1px solid #5b3aa8;" +
  "background:#2a1450;color:#fff;font:13px/1.3 system-ui,sans-serif;cursor:pointer;}" +
  "#wg-auto-panel .wg-section{margin:12px 0 6px;font-size:11px;font-weight:700;color:#a78bfa;text-transform:uppercase;}" +
  "#wg-auto-panel .wg-map{margin:8px 0 12px;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.25);font-size:11px;line-height:1.5;}" +
  "#wg-auto-panel .wg-map .wg-cp{opacity:.55;}#wg-auto-panel .wg-map .wg-cp-here{color:#fff;opacity:1;font-weight:700;}";

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function panelHtml(menu, nodeNames, library) {
  const here = menu.here;
  const hereLabel = here ?? "Unknown — pick Start here";
  const chips = nodeNames
    .map((cp) => {
      const cls = cp === here ? "wg-cp wg-cp-here" : "wg-cp";
      return `<span class="${cls}">${esc(cp)}${cp === here ? " (here)" : ""}</span>`;
    })
    .join(" · ");
  let html =
    `<style>${PANEL_CSS}</style><div id="wg-auto-panel">` +
    `<h3>waygraph auto</h3><div class="wg-here">You are here: <strong>${esc(hereLabel)}</strong></div>` +
    `<div class="wg-actions">`;
  for (const section of menu.sections) {
    html += `<div class="wg-section">${esc(section.title)}</div>`;
    for (const c of section.edges) {
      const entry = library.get(c.block);
      const desc = entry?.description ? `<br><span style="opacity:.85">${esc(entry.description)}</span>` : "";
      html +=
        `<button class="wg-act"><span class="wg-kind">${esc(c.kind)}</span> ` +
        `<strong>${esc(c.block)}</strong> → ${esc(c.to)}${desc}</button>`;
    }
  }
  html += `</div><div class="wg-map"><strong>Screens:</strong> ${chips}</div></div>`;
  return html;
}

async function capture(label, page, menu, nodeNames, library) {
  await page.evaluate((inner) => {
    let host = document.getElementById("wg-auto-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "wg-auto-host";
      document.documentElement.appendChild(host);
    }
    host.innerHTML = inner;
  }, panelHtml(menu, nodeNames, library));
  const path = join(outDir, `headful-${label}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(path);
}

const { graph, library } = await buildExploreContext(projectDir);
const nodeNames = graph.nodes.map((n) => n.checkpoint);
const navTags = library.navBlocks.map((n) => n.block);

const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe, args: ["--no-sandbox", "--disable-dev-shm-usage"] } : {}),
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  baseURL: "https://www.saucedemo.com",
});
const page = await context.newPage();
await page.goto("/", { waitUntil: "load" });

async function hereNow(p) {
  const path = new URL(p.url()).pathname;
  if (path.includes("inventory.html") && !path.includes("inventory-item")) return "LoggedIn";
  if (path.includes("inventory-item.html")) return "ItemDetailPage";
  if (path.includes("cart.html")) return "CartPage";
  if (path === "/" || path === "") {
    if (await p.locator("#login-button").isVisible({ timeout: 500 }).catch(() => false)) return "LoginPage";
  }
  return locate(p, navTags, { timeoutMs: 1500 });
}

const here1 = await hereNow(page);
const menu1 = await buildExploreMenu(page, graph, library, here1);
await capture("login", page, menu1, nodeNames, library.byName);

await page.locator("#user-name").fill("standard_user");
await page.locator("#password").fill("secret_sauce");
await page.locator("#login-button").click();
await page.waitForURL(/inventory\.html/);

const here2 = await hereNow(page);
const menu2 = await buildExploreMenu(page, graph, library, here2);
await capture("logged-in", page, menu2, nodeNames, library.byName);

await browser.close();
