/**
 * Headed visual demo: mobile -> tablet -> desktop with toast + seamless lerp.
 * Usage (from examples/saucedemo): WG_DEVICE_HOLD_MS=5000 node scripts/demo-device-presets.mjs
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
    title: "Now in mobile mode",
  },
  tablet: {
    preset: "tablet",
    viewport: { width: 768, height: 1024 },
    touchMode: true,
    title: "Now in tablet mode",
  },
  desktop: {
    preset: "desktop",
    viewport: { width: 1280, height: 720 },
    touchMode: false,
    title: "Back to desktop",
  },
};

const CSS = `
#wg-device-toast{position:fixed;z-index:2147483647;top:14px;right:14px;
display:flex;align-items:center;gap:10px;min-width:200px;max-width:min(92vw,320px);
padding:12px 14px;border-radius:14px;background:rgba(20,10,40,.96);color:#f0e8ff;
border:1px solid rgba(124,58,237,.55);box-shadow:0 10px 28px rgba(0,0,0,.4);
font:600 13px/1.35 system-ui,sans-serif;pointer-events:none;
opacity:0;transform:translateX(18px) scale(.96);
transition:opacity .35s ease,transform .45s cubic-bezier(.22,1,.36,1);}
#wg-device-toast.wg-in{opacity:1;transform:translateX(0) scale(1);}
#wg-device-toast.wg-out{opacity:0;transform:translateX(12px) scale(.98);}
#wg-device-toast[data-preset=mobile]{border-color:#3B82F6;}
#wg-device-toast[data-preset=tablet]{border-color:#22C55E;}
#wg-device-toast[data-preset=desktop]{border-color:#9CA3AF;}
#wg-device-toast .wg-dev-icon{flex:0 0 auto;width:36px;height:36px;border-radius:10px;
display:flex;align-items:center;justify-content:center;background:rgba(124,58,237,.28);}
#wg-device-toast[data-preset=mobile] .wg-dev-icon{background:rgba(59,130,246,.28);}
#wg-device-toast[data-preset=tablet] .wg-dev-icon{background:rgba(34,197,94,.28);}
#wg-device-toast[data-preset=desktop] .wg-dev-icon{background:rgba(156,163,175,.28);}
#wg-device-toast .wg-dev-icon svg{width:22px;height:22px;display:block;}
#wg-device-toast .wg-dev-title{font:800 13px/1.2 system-ui,sans-serif;color:#fff;}
#wg-device-toast .wg-dev-sub{margin-top:3px;font:600 11px/1.3 system-ui,sans-serif;color:#c9a6ff;}
#wg-device-badge{position:fixed;z-index:2147483646;top:14px;right:14px;
display:inline-flex;align-items:center;gap:6px;padding:6px 10px 6px 8px;
border-radius:999px;background:rgba(20,10,40,.92);color:#f0e8ff;
border:1px solid rgba(124,58,237,.5);font:700 11px/1.2 system-ui,sans-serif;
letter-spacing:.04em;text-transform:uppercase;pointer-events:none;
box-shadow:0 4px 14px rgba(0,0,0,.3);opacity:0;transition:opacity .3s ease;}
#wg-device-badge.wg-in{opacity:1;}
#wg-device-badge[data-preset=mobile]{border-color:#3B82F6;}
#wg-device-badge[data-preset=tablet]{border-color:#22C55E;}
#wg-device-badge .wg-dev-icon svg{width:14px;height:14px;display:block;}
`;

const ICONS = {
  mobile:
    '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.2"/><circle cx="12" cy="18.2" r="1.1" fill="#fff" stroke="none"/></svg>',
  tablet:
    '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4" width="17" height="16" rx="2"/><circle cx="12" cy="17.2" r="1" fill="#fff" stroke="none"/></svg>',
  desktop:
    '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.5" width="19" height="12.5" rx="1.5"/><path d="M8 20h8M12 16v4"/></svg>',
};

async function lerpViewport(page, to, ms = 520) {
  const from = page.viewportSize() || { width: 1280, height: 720 };
  const steps = 14;
  const stepMs = Math.max(12, Math.floor(ms / steps));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t * t * (3 - 2 * t);
    await page.setViewportSize({
      width: Math.round(from.width + (to.width - from.width) * e),
      height: Math.round(from.height + (to.height - from.height) * e),
    });
    if (i < steps) await page.waitForTimeout(stepMs);
  }
}

async function applyPreset(page, key) {
  const d = PRESETS[key];
  await lerpViewport(page, d.viewport, 520);
  await page.evaluate(
    ({ d, css, icons, key }) => {
      let style = document.getElementById("wg-device-demo-style");
      if (!style) {
        style = document.createElement("style");
        style.id = "wg-device-demo-style";
        style.textContent = css;
        document.documentElement.appendChild(style);
      }
      let toast = document.getElementById("wg-device-toast");
      if (toast && toast._wgTimer) clearTimeout(toast._wgTimer);
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "wg-device-toast";
        document.documentElement.appendChild(toast);
      }
      const badge = document.getElementById("wg-device-badge");
      if (badge) badge.classList.remove("wg-in");
      toast.dataset.preset = d.preset;
      const sub =
        d.viewport.width +
        "\u00d7" +
        d.viewport.height +
        (d.touchMode ? " \u00b7 touch" : " \u00b7 mouse");
      toast.innerHTML =
        '<span class="wg-dev-icon">' +
        icons[d.preset] +
        '</span><span class="wg-dev-copy"><div class="wg-dev-title">' +
        d.title +
        '</div><div class="wg-dev-sub">' +
        sub +
        "</div></span>";
      toast.classList.remove("wg-out");
      void toast.offsetWidth;
      toast.classList.add("wg-in");
      toast._wgTimer = setTimeout(() => {
        toast.classList.add("wg-out");
        toast.classList.remove("wg-in");
        setTimeout(() => {
          if (d.preset === "desktop" && !d.touchMode) {
            const b = document.getElementById("wg-device-badge");
            if (b) b.remove();
            return;
          }
          let chip = document.getElementById("wg-device-badge");
          if (!chip) {
            chip = document.createElement("div");
            chip.id = "wg-device-badge";
            document.documentElement.appendChild(chip);
          }
          chip.dataset.preset = d.preset;
          chip.innerHTML =
            '<span class="wg-dev-icon">' +
            icons[d.preset] +
            '</span><span>' +
            d.preset +
            " \u00b7 remain</span>";
          chip.classList.add("wg-in");
        }, 380);
      }, 2200);
    },
    { d, css: CSS, icons: ICONS, key },
  );
}

const holdMs = Number(process.env.WG_DEVICE_HOLD_MS || 4500);
const executablePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH || undefined;

const browser = await chromium.launch({
  headless: false,
  ...(executablePath ? { executablePath } : {}),
});
const context = await browser.newContext({
  hasTouch: true,
  viewport: { width: 1280, height: 720 },
});
const page = await context.newPage();
await page.goto("https://www.saucedemo.com/", { waitUntil: "domcontentloaded" });

const shots = [];
for (const key of ["mobile", "tablet", "desktop"]) {
  console.log("device demo:", key);
  await applyPreset(page, key);
  await page.waitForTimeout(900);
  const shot = join(outDir, `device-${key}.png`);
  await page.screenshot({ path: shot, fullPage: false });
  shots.push(shot);
  console.log("  shot:", shot);
  await page.waitForTimeout(holdMs);
}

console.log("DEVICE_DEMO_DONE", JSON.stringify(shots));
await page.waitForTimeout(1500);
await browser.close();
