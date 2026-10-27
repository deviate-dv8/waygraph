// The demo cursor: travels to what a step clicks, pulses on the click, draws a swipe trail on touch devices.

import type { WgBox, WgPage } from "../types.js";
import { ignorePageGone } from "../../engine/page-gone.js";

/** A touch swipe: which way, its caption (plus an optional hint) and how long it takes. */
export interface SwipeTrailOptions {
  dir?: "left" | "right" | "up" | "down";
  label?: string;
  hint?: string;
  ms?: number;
}

export async function moveCursorTo(page: WgPage, box: WgBox, ms: number) {
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const travel = Math.max(0, Number(ms) || 0);
  await page
    .evaluate(({ x, y, ms }) => {
      if (window.__wgMoveCursorTo) window.__wgMoveCursorTo(x, y, ms);
    }, { x, y, ms: travel })
    .catch(ignorePageGone);
  // CSS transition is async - wait the full travel so the cursor is ON the
  // target before ring/pulse/real click (NavBlock click nav was skipping
  // this and looked like a teleport).
  if (travel > 0) {
    await new Promise((res) => setTimeout(res, travel));
  }
  return { x, y };
}


export async function clickPulseAt(page: WgPage, x: number, y: number, tone?: string) {
  await page
    .evaluate(({ x, y, tone }) => {
      if (window.__wgClickPulse) window.__wgClickPulse(x, y, tone || "planned");
    }, { x, y, tone: tone || "planned" })
    .catch(ignorePageGone);
}


/**
 * Touch swipe trail (mobile/tablet). dir: left|right|up|down.
 * Returns after the trail animation completes.
 * Self-contained when overlay helper is not installed yet (device runs before panel).
 */
export async function playSwipeTrail(page: WgPage, opts?: SwipeTrailOptions) {
  const o = opts || {};
  const waitMs = await page
    .evaluate((payload: Required<SwipeTrailOptions>) => {
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
      let layer = __wgById("wg-swipe-layer");
      if (layer) layer.remove();
      // The swipe trail's look is fx.css (#wg-swipe-layer and its parts); only positions are set here.
      const finger = __wgEl("div", { class: "wg-swipe-finger", style: "opacity:1" });
      layer = __wgEl("div", { id: "wg-swipe-layer", class: "wg-in", attrs: { "data-wg-ui": "1" } }, __wgEl("div", { class: "wg-swipe-label" }, label), finger);
      __wgAdd(layer);
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
          const dot = __wgEl("div", {
            class: "wg-swipe-dot",
            style: `left:${x}px;top:${y}px;opacity:${0.85 - t * 0.55};transition:opacity .45s ease,transform .45s ease`,
          });
          layer.appendChild(dot);
          requestAnimationFrame(() => {
            dot.style.opacity = "0";
            dot.style.transform = "scale(1.8)";
          });
          if (i === steps) {
            setTimeout(() => {
              const el = __wgById("wg-swipe-layer");
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
    .catch(ignorePageGone);
  const n = Number(waitMs) || 0;
  if (n > 0) await new Promise((r) => setTimeout(r, n));
}
