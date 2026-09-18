/**
 * Headed visual demo: mobile -> tablet -> desktop presets (waygraph 0.13+).
 * Usage: node scripts/demo-device-presets.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../.tmp/device-demo");
mkdirSync(outDir, { recursive: true });

const PRESETS = {
  mobile: {
    preset: "mobile",
    viewport: { width: 390, height: 844 },
    touchMode: true,
    label: "mobile · remain",
  },
  tablet: {
    preset: "tablet",
    viewport: { width: 768, height: 1024 },
    touchMode: true,
    label: "tablet · remain",
  },
  desktop: {
    preset: "desktop",
    viewport: { width: 1280, height: 720 },
    touchMode: false,
    label: "desktop",
  },
};

const BADGE_CSS = `
#wg-device-badge{position:fixed;z-index:2147483646;top:14px;right:14px;
padding:6px 10px;border-radius:999px;background:rgba(20,10,40,.92);color:#f0e8ff;
border:1px solid rgba(124,58,237,.5);font:700 11px/1.2 system-ui,sans-serif;
letter-spacing:.04em;text-transform:uppercase;pointer-events:none;
box-shadow:0 4px 14px rgba(0,0,0,.3);}
#wg-device-badge[data-preset=mobile]{border-color:#3B82F6;}
#wg-device-badge[data-preset=tablet]{border-color:#22C55E;}
#wg-device-badge[data-preset=desktop]{border-color:#9CA3AF;}
#wg-device-badge[data-touch=1]::after{content:' · touch';opacity:.85;}
#wg-cursor{position:fixed;z-index:2147483647;width:28px;height:28px;pointer-events:none;
left:0;top:0;opacity:1;margin:0;transform:translate(40px,120px);
filter:drop-shadow(0 2px 4px rgba(12,12,26,.4));}
#wg-demo-caption{position:fixed;z-index:2147483646;left:14px;bottom:14px;
padding:10px 14px;border-radius:12px;background:rgba(20,10,40,.94);color:#fff;
font:600 13px/1.35 system-ui,sans-serif;border:1px solid rgba(124,58,237,.45);
max-width:min(90vw,360px);}
`;

const FINGER =
  "<svg viewBox='0 0 32 32' width='28' height='28'>" +
  "<ellipse cx='16' cy='22' rx='7' ry='8' fill='#0C0C1A' stroke='#fff' stroke-width='1.4'/>" +
  "<rect x='12' y='6' width='8' height='16' rx='4' fill='#0C0C1A' stroke='#fff' stroke-width='1.4'/>" +
  "</svg>";
const MOUSE =
  "<svg viewBox='0 0 32 32' width='24' height='24'>" +
  "<path fill='#0C0C1A' stroke='#fff' stroke-width='1.4' stroke-linejoin='round' " +
  "d='M6 3.5l1.4 22.5 5.8-5.4 4.2 9.4 3.6-1.6-4.2-9.2H26z'/></svg>";

async function applyPreset(page, key) {
  const d = PRESETS[key];
  await page.setViewportSize(d.viewport);
  await page.evaluate(
    ({ d, css, finger, mouse, key }) => {
      let style = document.getElementById("wg-device-demo-style");
      if (!style) {
        style = document.createElement("style");
        style.id = "wg-device-demo-style";
        style.textContent = css;
        document.documentElement.appendChild(style);
      }
      let badge = document.getElementById("wg-device-badge");
      if (!badge) {
        badge = document.createElement("div");
        badge.id = "wg-device-badge";
        document.documentElement.appendChild(badge);
      }
      badge.dataset.preset = d.preset;
      badge.dataset.touch = d.touchMode ? "1" : "0";
      badge.textContent = d.label;
      let cursor = document.getElementById("wg-cursor");
      if (!cursor) {
        cursor = document.createElement("div");
        cursor.id = "wg-cursor";
        document.documentElement.appendChild(cursor);
      }
      cursor.innerHTML = d.touchMode ? finger : mouse;
      let cap = document.getElementById("wg-demo-caption");
      if (!cap) {
        cap = document.createElement("div");
        cap.id = "wg-demo-caption";
        document.documentElement.appendChild(cap);
      }
      const sizes = {
        mobile: "390 x 844 + finger / tap",
        tablet: "768 x 1024 + finger / tap",
        desktop: "1280 x 720 + mouse",
      };
      cap.textContent =
        "waygraph device: " + key + " — " + sizes[key] + " (auto-advancing)";
    },
    { d, css: BADGE_CSS, finger: FINGER, mouse: MOUSE, key },
  );
}

const holdMs = Number(process.env.WG_DEVICE_HOLD_MS || 4500);
const executablePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH || undefined;

const browser = await chromium.launch({
  headless: false,
  slowMo: 0,
  ...(executablePath ? { executablePath } : {}),
  args: ["--start-maximized"],
});
const context = await browser.newContext({ hasTouch: true, viewport: null });
const page = await context.newPage();
await page.goto("https://www.saucedemo.com/", { waitUntil: "domcontentloaded" });

const shots = [];
for (const key of ["mobile", "tablet", "desktop"]) {
  console.log("device demo:", key);
  await applyPreset(page, key);
  await page.waitForTimeout(800);
  const shot = join(outDir, `device-${key}.png`);
  await page.screenshot({ path: shot, fullPage: false });
  shots.push(shot);
  console.log("  shot:", shot);
  await page.waitForTimeout(holdMs);
}

console.log("DEVICE_DEMO_DONE", JSON.stringify(shots));
await page.waitForTimeout(2000);
await browser.close();
