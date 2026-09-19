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
const { Engine, start, end, MemPage } = await import(pathToFileURL(join(waygraphDist, "index.js")).href);

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

function panelHtml(menu, nodeNames, library, note) {
  const here = menu.here;
  const hereLabel = here ?? "Unknown";
  const chips = nodeNames
    .map((cp) => {
      const cls = cp === here ? "wg-cp wg-cp-here" : "wg-cp";
      return `<span class="${cls}">${esc(cp)}${cp === here ? " (here)" : ""}</span>`;
    })
    .join(" · ");
  let html =
    `<style>${PANEL_CSS}</style><div id="wg-auto-panel">` +
    `<h3>waygraph auto</h3>` +
    (note ? `<div style="color:#fca5a5;margin-bottom:8px;font-size:12px">${esc(note)}</div>` : "") +
    `<div class="wg-here">You are here: <strong>${esc(hereLabel)}</strong></div>` +
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

async function paintPanel(page, menu, nodeNames, library, note) {
  await page.evaluate((inner) => {
    let host = document.getElementById("wg-auto-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "wg-auto-host";
      document.documentElement.appendChild(host);
    }
    host.innerHTML = inner;
  }, panelHtml(menu, nodeNames, library, note));
}

async function snap(page, name) {
  const path = join(outDir, name);
  await page.screenshot({ path, fullPage: false });
  console.log(path);
  return path;
}

const { graph, library } = await buildExploreContext(root);
const nodeNames = graph.nodes.map((n) => n.checkpoint);

const { NavLoginBlock } = await import(pathToFileURL(join(root, "src/blocks/saucedemo-web/nav-login.block.js")).href);
const { FillUsernameBlock } = await import(
  pathToFileURL(join(root, "src/blocks/saucedemo-web/methods/fill-username.method.block.js")).href
);
const { FillPasswordBlock } = await import(
  pathToFileURL(join(root, "src/blocks/saucedemo-web/methods/fill-password.method.block.js")).href
);
const { SubmitLoginBlock } = await import(
  pathToFileURL(join(root, "src/blocks/saucedemo-web/methods/submit-login.method.block.js")).href
);
const { LoginCreds } = await import(pathToFileURL(join(root, "src/states/checkout.mem-keys.js")).href);

const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe, args: ["--no-sandbox", "--disable-dev-shm-usage"] } : {}),
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  baseURL: "https://www.saucedemo.com",
});
const page = await context.newPage();
const engine = new Engine({ headless: true });
const mem = new MemPage();

await page.goto("/", { waitUntil: "load" });

const menuBefore = await buildExploreMenu(page, graph, library, "LoginPage");
await paintPanel(page, menuBefore, nodeNames, library.byName, "Mem: standard_user / wrong-password (intentional)");
await snap(page, "wrong-login-1-before.png");

mem.set(LoginCreds({ username: "standard_user", password: "wrong-password" }));
const flow = engine.defineFlow([start, NavLoginBlock, FillUsernameBlock, FillPasswordBlock, SubmitLoginBlock, end]);
const runOut = await flow.run(context, mem, { page, closeOnFinish: false });
const result = runOut && typeof runOut === "object" && "result" in runOut ? runOut.result : runOut;

if (result.__state !== "LoginPage") {
  throw new Error(`expected LoginPage after bad password, got ${result?.__state}`);
}

await page.locator('[data-test="error"]').waitFor({ state: "visible" });

const menuAfter = await buildExploreMenu(page, graph, library, "LoginPage");
await paintPanel(
  page,
  menuAfter,
  nodeNames,
  library.byName,
  "submit-login finished → LoginPage (branch on auth failure, not LoggedIn)",
);
await snap(page, "wrong-login-2-after.png");

console.log("PASS: wrong password stayed on LoginPage with error banner");
await browser.close();
