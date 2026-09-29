/**
 * Blind-agent / Playwright checks for waygraph overlay modals.
 *
 * Every live modal root must carry:
 *   data-wg-ui="1"
 *   data-wg-modal="panel|banner|auto-panel"
 *   data-wg-ready="1" when painted and readable
 *
 * Agents: do not claim the stepper works unless
 *   `assertWgOverlayReady(page)` (or WAYGRAPH_PROVE_EXIT=1) passes.
 */

import type { Page } from "@playwright/test";

export const WG_UI_SEL = '[data-wg-ui="1"]';
export const WG_READY_PANEL_SEL = '[data-wg-modal="panel"][data-wg-ready="1"]';
export const WG_READY_AUTO_SEL = '[data-wg-modal="auto-panel"][data-wg-ready="1"]';
export const WG_READY_BANNER_SEL = '[data-wg-modal="banner"][data-wg-ready="1"]';

export type WgModalKind = "panel" | "banner" | "auto-panel";

export type WgBeaconRow = {
  id: string | null;
  modal: string | null;
  ready: boolean;
  phase: string | null;
  step: string | null;
  block: string | null;
  collapsed: boolean;
  opacity: string;
  textLen: number;
  w: number;
  h: number;
  visible: boolean;
};

/** Browser-side beacon reader (also installed as window.__wgOverlayBeacon). */
export function readWgOverlayBeaconInPage(): WgBeaconRow[] {
  const w = globalThis as unknown as { __wgOverlayBeacon?: () => WgBeaconRow[] };
  if (typeof w.__wgOverlayBeacon === "function") return w.__wgOverlayBeacon();
  return Array.from(document.querySelectorAll(WG_UI_SEL)).map((el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return {
      id: el.id || null,
      modal: el.getAttribute("data-wg-modal"),
      ready: el.getAttribute("data-wg-ready") === "1",
      phase: el.getAttribute("data-wg-phase"),
      step: el.getAttribute("data-wg-step"),
      block: el.getAttribute("data-wg-block"),
      collapsed:
        el.getAttribute("data-wg-collapsed") === "1" || el.classList.contains("wg-collapsed"),
      opacity: st.opacity,
      textLen: (el.textContent || "").trim().length,
      w: Math.round(r.width),
      h: Math.round(r.height),
      visible: r.width > 0 && r.height > 0 && Number(st.opacity) > 0.05,
    };
  });
}

export async function readWgOverlayBeacon(page: Page): Promise<WgBeaconRow[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __wgOverlayBeacon?: () => unknown };
    if (typeof w.__wgOverlayBeacon === "function") {
      return w.__wgOverlayBeacon() as WgBeaconRow[];
    }
    return Array.from(document.querySelectorAll('[data-wg-ui="1"]')).map((el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return {
        id: el.id || null,
        modal: el.getAttribute("data-wg-modal"),
        ready: el.getAttribute("data-wg-ready") === "1",
        phase: el.getAttribute("data-wg-phase"),
        step: el.getAttribute("data-wg-step"),
        block: el.getAttribute("data-wg-block"),
        collapsed:
          el.getAttribute("data-wg-collapsed") === "1" || el.classList.contains("wg-collapsed"),
        opacity: st.opacity,
        textLen: (el.textContent || "").trim().length,
        w: Math.round(r.width),
        h: Math.round(r.height),
        visible: r.width > 0 && r.height > 0 && Number(st.opacity) > 0.05,
      };
    });
  });
}

/**
 * Hard gate: a blank / missing / opacity-0 modal fails.
 * Use after demo/auto paints its first overlay.
 */
export async function assertWgOverlayReady(
  page: Page,
  opts?: {
    modal?: WgModalKind;
    minTextLen?: number;
    /** When true, collapsed mini chrome is allowed (still needs visible box + text). */
    allowCollapsed?: boolean;
  },
): Promise<WgBeaconRow> {
  const modal = opts?.modal ?? "panel";
  const minText = opts?.minTextLen ?? 12;
  const rows = await readWgOverlayBeacon(page);
  const hit = rows.find(
    (r) =>
      r.modal === modal &&
      r.ready &&
      r.visible &&
      r.textLen >= minText &&
      (opts?.allowCollapsed || !r.collapsed || r.textLen >= minText),
  );
  if (!hit) {
    throw new Error(
      `waygraph overlay NOT ready (modal=${modal}, minTextLen=${minText}). ` +
        `beacons=${JSON.stringify(rows)}. ` +
        `Do not claim stepper/modal works.`,
    );
  }
  return hit;
}
