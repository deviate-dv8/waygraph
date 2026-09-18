/**
 * Record a .webm of: portrait/landscape + click / tap / hold theater.
 * Square capture so orientation changes are obvious in the video frame.
 *
 * From examples/saucedemo:
 *   node scripts/demo-orientation-gestures-video.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../.tmp/device-demo");
mkdirSync(outDir, { recursive: true });

const CAPTURE = { width: 1080, height: 1080 };

const PRESETS = {
  mobilePortrait: { w: 390, h: 844, preset: "mobile", orient: "portrait", touch: true },
  mobileLandscape: { w: 844, h: 390, preset: "mobile", orient: "landscape", touch: true },
  tabletPortrait: { w: 768, h: 1024, preset: "tablet", orient: "portrait", touch: true },
  tabletLandscape: { w: 1024, h: 768, preset: "tablet", orient: "landscape", touch: true },
  desktop: { w: 1280, h: 720, preset: "desktop", orient: "landscape", touch: false },
};

const CSS = `
html,body{margin:0;background:#0b1220;}
#wg-stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
background:radial-gradient(ellipse at 50% 30%,#1a1030 0%,#0b1220 70%);}
#wg-frame{position:relative;background:#fff;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.55);
border:3px solid #2a1650;border-radius:18px;transition:width .5s cubic-bezier(.22,1,.36,1),
height .5s cubic-bezier(.22,1,.36,1),border-radius .4s ease;}
#wg-frame iframe{border:0;width:100%;height:100%;display:block;}
#wg-device-toast{position:fixed;z-index:2147483647;top:18px;right:18px;
display:flex;align-items:center;gap:10px;min-width:220px;max-width:340px;
padding:12px 14px;border-radius:14px;background:rgba(20,10,40,.96);color:#f0e8ff;
border:1px solid rgba(124,58,237,.55);box-shadow:0 10px 28px rgba(0,0,0,.45);
font:600 13px/1.35 system-ui,sans-serif;pointer-events:none;
opacity:0;transform:translateX(18px);transition:opacity .35s ease,transform .45s cubic-bezier(.22,1,.36,1);}
#wg-device-toast.wg-in{opacity:1;transform:translateX(0);}
#wg-device-toast[data-preset=mobile]{border-color:#3B82F6;}
#wg-device-toast[data-preset=tablet]{border-color:#22C55E;}
#wg-device-toast[data-preset=desktop]{border-color:#9CA3AF;}
#wg-device-toast .wg-dev-icon{width:36px;height:36px;border-radius:10px;display:flex;
align-items:center;justify-content:center;background:rgba(124,58,237,.28);}
#wg-device-toast .wg-dev-title{font:800 13px/1.2 system-ui,sans-serif;color:#fff;}
#wg-device-toast .wg-dev-sub{margin-top:3px;font:600 11px/1.3 system-ui,sans-serif;color:#c9a6ff;}
#wg-gesture-banner{position:fixed;z-index:2147483646;left:18px;bottom:18px;
padding:10px 14px;border-radius:12px;background:rgba(20,10,40,.94);color:#fff;
font:700 13px/1.3 system-ui,sans-serif;border:1px solid rgba(124,58,237,.45);}
#wg-cursor{position:fixed;z-index:2147483647;width:28px;height:28px;pointer-events:none;
left:0;top:0;opacity:0;margin:0;transition:transform .55s cubic-bezier(.22,1,.36,1),opacity .2s;}
#wg-click-pulse{position:fixed;z-index:2147483647;width:18px;height:18px;margin-left:-9px;
margin-top:-9px;border-radius:50%;pointer-events:none;opacity:0;border:2px solid #7C3AED;
background:rgba(124,58,237,.3);}
#wg-click-pulse.wg-pulse{animation:wg-pulse .55s ease-out;}
#wg-click-pulse[data-hold=1]{border-color:#EAB308;background:rgba(234,179,8,.35);
width:28px;height:28px;margin-left:-14px;margin-top:-14px;}
@keyframes wg-pulse{0%{opacity:.95;transform:scale(.35);}100%{opacity:0;transform:scale(2.6);}}
`;

const ICONS = {
  mobile:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="1.8"><rect x="7" y="2.5" width="10" height="19" rx="2.2"/><circle cx="12" cy="18.2" r="1.1" fill="#fff" stroke="none"/></svg>',
  tablet:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="1.8"><rect x="3.5" y="4" width="17" height="16" rx="2"/><circle cx="12" cy="17.2" r="1" fill="#fff" stroke="none"/></svg>',
  desktop:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="1.8"><rect x="2.5" y="3.5" width="19" height="12.5" rx="1.5"/><path d="M8 20h8M12 16v4"/></svg>',
};

const MOUSE =
  "<svg viewBox='0 0 32 32' width='24' height='24'><path fill='#0C0C1A' stroke='#fff' stroke-width='1.4' d='M6 3.5l1.4 22.5 5.8-5.4 4.2 9.4 3.6-1.6-4.2-9.2H26z'/></svg>";
const FINGER =
  "<svg viewBox='0 0 32 32' width='28' height='28'><ellipse cx='16' cy='22' rx='7' ry='8' fill='#0C0C1A' stroke='#fff' stroke-width='1.4'/><rect x='12' y='6' width='8' height='16' rx='4' fill='#0C0C1A' stroke='#fff' stroke-width='1.4'/></svg>";

const executablePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH || undefined;

const browser = await chromium.launch({
  headless: false,
  ...(executablePath ? { executablePath } : {}),
});
const context = await browser.newContext({
  hasTouch: true,
  viewport: CAPTURE,
  recordVideo: { dir: outDir, size: CAPTURE },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

await page.setContent(`<!doctype html><html><head><style>${CSS}</style></head>
<body>
<div id="wg-stage"><div id="wg-frame" style="width:390px;height:844px">
<iframe id="wg-app" src="https://www.saucedemo.com/"></iframe>
</div></div>
<div id="wg-gesture-banner">waygraph · orientation + gestures</div>
<div id="wg-cursor">${FINGER}</div>
<div id="wg-click-pulse"></div>
</body></html>`);

await page.waitForTimeout(2500);

async function toast(title, sub, preset) {
  await page.evaluate(
    ({ title, sub, preset, icons }) => {
      let t = document.getElementById("wg-device-toast");
      if (!t) {
        t = document.createElement("div");
        t.id = "wg-device-toast";
        document.body.appendChild(t);
      }
      t.dataset.preset = preset;
      t.innerHTML =
        '<span class="wg-dev-icon">' +
        icons[preset] +
        '</span><span><div class="wg-dev-title">' +
        title +
        '</div><div class="wg-dev-sub">' +
        sub +
        "</div></span>";
      t.classList.remove("wg-in");
      void t.offsetWidth;
      t.classList.add("wg-in");
    },
    { title, sub, preset, icons: ICONS },
  );
}

async function setFrame(key) {
  const p = PRESETS[key];
  const title =
    key.includes("Landscape") || p.orient === "landscape"
      ? p.preset === "desktop"
        ? "Back to desktop"
        : "Rotated to landscape"
      : key.includes("Portrait") || p.orient === "portrait"
        ? p.preset === "mobile" && key === "mobilePortrait"
          ? "Now in mobile mode"
          : "Rotated to portrait"
        : "Device updated";
  // First switch: mobile portrait uses "Now in mobile"
  const t =
    key === "mobilePortrait"
      ? "Now in mobile mode"
      : key === "desktop"
        ? "Back to desktop"
        : key.includes("Landscape")
          ? "Rotated to landscape"
          : key.includes("Portrait")
            ? key.startsWith("tablet")
              ? "Now in tablet mode"
              : "Rotated to portrait"
            : title;

  await page.evaluate(
    ({ w, h, touch, finger, mouse }) => {
      const frame = document.getElementById("wg-frame");
      frame.style.width = w + "px";
      frame.style.height = h + "px";
      frame.style.borderRadius = touch ? (w < h ? "28px" : "18px") : "10px";
      const c = document.getElementById("wg-cursor");
      c.innerHTML = touch ? finger : mouse;
    },
    { w: p.w, h: p.h, touch: p.touch, finger: FINGER, mouse: MOUSE },
  );
  await toast(t, `${p.w}×${p.h} · ${p.orient}${p.touch ? " · touch" : " · mouse"}`, p.preset);
  await page.waitForTimeout(900);
}

async function banner(text) {
  await page.evaluate((text) => {
    const b = document.getElementById("wg-gesture-banner");
    if (b) b.textContent = text;
  }, text);
}

async function gestureAt(kind) {
  // Aim at center of the device frame (login button-ish on saucedemo).
  const box = await page.locator("#wg-frame").boundingBox();
  if (!box) return;
  const x = box.x + box.width * 0.5;
  const y = box.y + box.height * 0.58;
  await banner(
    kind === "click"
      ? "Gesture: CLICK (mouse)"
      : kind === "tap"
        ? "Gesture: TAP (touch)"
        : "Gesture: HOLD (long-press)",
  );
  await page.evaluate(
    ({ x, y, kind, ms }) => {
      const c = document.getElementById("wg-cursor");
      c.style.setProperty("--wg-cursor-ms", ms + "ms");
      c.style.opacity = "1";
      c.style.transform = `translate(${x - 8}px,${y - 8}px)`;
    },
    { x, y, kind, ms: 550 },
  );
  await page.waitForTimeout(600);
  await page.evaluate(
    ({ x, y, kind }) => {
      const p = document.getElementById("wg-click-pulse");
      p.style.left = x + "px";
      p.style.top = y + "px";
      p.dataset.hold = kind === "hold" ? "1" : "0";
      p.classList.remove("wg-pulse");
      void p.offsetWidth;
      p.classList.add("wg-pulse");
    },
    { x, y, kind },
  );
  await page.waitForTimeout(kind === "hold" ? 900 : 550);
}

// Sequence: portrait -> landscape (shows in square video) + gestures
await setFrame("mobilePortrait");
await page.waitForTimeout(1200);
await gestureAt("tap");
await page.waitForTimeout(700);

await setFrame("mobileLandscape");
await page.waitForTimeout(1400);
await gestureAt("hold");
await page.waitForTimeout(700);

await setFrame("tabletPortrait");
await page.waitForTimeout(1200);
await gestureAt("tap");
await page.waitForTimeout(600);

await setFrame("tabletLandscape");
await page.waitForTimeout(1400);
await gestureAt("click");
await page.waitForTimeout(800);

await setFrame("desktop");
await page.waitForTimeout(1500);

await banner("waygraph · orientation + gestures · done");
await page.waitForTimeout(1000);

const vid = page.video();
await context.close();
await browser.close();

let saved = null;
if (vid) {
  const raw = await vid.path();
  saved = join(outDir, "orientation-gestures.webm");
  try {
    copyFileSync(raw, saved);
  } catch {
    saved = raw;
  }
}
console.log("ORIENTATION_GESTURES_VIDEO", saved || outDir);
console.log(
  "files",
  readdirSync(outDir)
    .filter((f) => f.endsWith(".webm"))
    .join(", "),
);
