// Moved verbatim from the former CHAIN_RUNNER_SCRIPT template string in cli.ts (see src/ARCHITECTURE.md).
// Runs inside the target project's own waygraph copy - keep it dependency-light and self-contained.

export async function moveCursorTo(page, box, ms) {
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const travel = Math.max(0, Number(ms) || 0);
  await page
    .evaluate(({ x, y, ms }) => {
      if (window.__wgMoveCursorTo) window.__wgMoveCursorTo(x, y, ms);
    }, { x, y, ms: travel })
    .catch(() => {});
  // CSS transition is async - wait the full travel so the cursor is ON the
  // target before ring/pulse/real click (NavBlock click nav was skipping
  // this and looked like a teleport).
  if (travel > 0) {
    await new Promise((res) => setTimeout(res, travel));
  }
  return { x, y };
}


export async function clickPulseAt(page, x, y, tone) {
  await page
    .evaluate(({ x, y, tone }) => {
      if (window.__wgClickPulse) window.__wgClickPulse(x, y, tone || "planned");
    }, { x, y, tone: tone || "planned" })
    .catch(() => {});
}


/**
 * Touch swipe trail (mobile/tablet). dir: left|right|up|down.
 * Returns after the trail animation completes.
 * Self-contained when overlay helper is not installed yet (device runs before panel).
 */
export async function playSwipeTrail(page, opts) {
  const o = opts || {};
  const waitMs = await page
    .evaluate((payload) => {
      if (typeof window.__wgSwipeTrail === "function") {
        return window.__wgSwipeTrail(payload);
      }
      // Fallback: inject a one-shot trail without full overlay install.
      const dir =
        payload.dir === "right" || payload.dir === "up" || payload.dir === "down"
          ? payload.dir
          : "left";
      const ms = Math.max(280, Math.min(1400, Number(payload.ms) || 720));
      const label = payload.label || "swipe";
      let layer = document.getElementById("wg-swipe-layer");
      if (layer) layer.remove();
      layer = document.createElement("div");
      layer.id = "wg-swipe-layer";
      layer.setAttribute("data-wg-ui", "1");
      layer.style.cssText =
        "position:fixed;inset:0;z-index:2147483646;pointer-events:none;overflow:hidden;";
      const finger = document.createElement("div");
      finger.style.cssText =
        "position:absolute;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;" +
        "background:rgba(15,23,42,.92);border:2px solid #fff;box-shadow:0 4px 16px rgba(0,0,0,.4);";
      const lab = document.createElement("div");
      lab.textContent = label;
      lab.style.cssText =
        "position:absolute;left:50%;top:18%;transform:translateX(-50%);padding:6px 12px;" +
        "border-radius:999px;background:rgba(15,23,42,.88);color:#e0f2fe;" +
        "border:1px solid rgba(56,189,248,.55);font:700 12px/1.2 system-ui,sans-serif;";
      layer.appendChild(lab);
      layer.appendChild(finger);
      document.documentElement.appendChild(layer);
      const vw = window.innerWidth || 390;
      const vh = window.innerHeight || 844;
      const pad = Math.min(vw, vh) * 0.18;
      let x0;
      let y0;
      let x1;
      let y1;
      if (dir === "left") {
        x0 = vw - pad;
        x1 = pad;
        y0 = y1 = vh * 0.52;
      } else if (dir === "right") {
        x0 = pad;
        x1 = vw - pad;
        y0 = y1 = vh * 0.52;
      } else if (dir === "up") {
        x0 = x1 = vw * 0.5;
        y0 = vh - pad;
        y1 = pad;
      } else {
        x0 = x1 = vw * 0.5;
        y0 = pad;
        y1 = vh - pad;
      }
      finger.style.left = x0 + "px";
      finger.style.top = y0 + "px";
      const steps = 12;
      const stepMs = Math.floor(ms / steps);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const e = t * t * (3 - 2 * t);
        const x = x0 + (x1 - x0) * e;
        const y = y0 + (y1 - y0) * e;
        setTimeout(() => {
          finger.style.left = x + "px";
          finger.style.top = y + "px";
          const dot = document.createElement("div");
          dot.style.cssText =
            "position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;" +
            "background:rgba(147,197,253,.55);border:2px solid rgba(255,255,255,.85);left:" +
            x +
            "px;top:" +
            y +
            "px;opacity:" +
            (0.85 - t * 0.55) +
            ";transition:opacity .45s ease,transform .45s ease;";
          layer.appendChild(dot);
          requestAnimationFrame(() => {
            dot.style.opacity = "0";
            dot.style.transform = "scale(1.8)";
          });
          if (i === steps) {
            setTimeout(() => {
              const el = document.getElementById("wg-swipe-layer");
              if (el) el.remove();
            }, 400);
          }
        }, i * stepMs);
      }
      return ms + 120;
    }, {
      dir: o.dir || "left",
      label: o.label || "swipe",
      hint: o.hint || "",
      ms: o.ms || 720,
    })
    .catch(() => 0);
  const n = Number(waitMs) || 0;
  if (n > 0) await new Promise((r) => setTimeout(r, n));
}
