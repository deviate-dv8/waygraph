// The demo cursor: travels to what a step clicks, pulses on the click, draws a swipe trail on touch devices.

import { setTimeout as sleep } from "node:timers/promises";
import type { WgBox, WgPage } from "../types.js";
import { ignorePageGone } from "../../engine/page-gone.js";
import { installSwipeZoom } from "./inpage/swipe-zoom.js";
import { ensureShadowRoot } from "./ui/shadow.js";

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
    await sleep(travel);
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
 * Touch swipe trail (mobile/tablet). dir: left|right|up|down. Returns after the trail animation completes. Installs the
 * overlay's trail first when the page has none yet (a device change runs before the panel).
 */
export async function playSwipeTrail(page: WgPage, opts?: SwipeTrailOptions) {
  const o = opts || {};
  await ensureShadowRoot(page);
  await page.evaluate(installSwipeZoom).catch(ignorePageGone);
  const waitMs = await page
    .evaluate((payload: Required<SwipeTrailOptions>) => window.__wgSwipeTrail?.(payload) ?? 0, {
      dir: o.dir || "left",
      label: o.label || "swipe",
      hint: o.hint || "",
      ms: o.ms || 720,
    })
    .catch(ignorePageGone);
  const n = Number(waitMs) || 0;
  if (n > 0) await sleep(n);
}
