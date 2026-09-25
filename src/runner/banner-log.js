// Banner (title card) authoring + verbose log helpers. Mirrors the todo dock's probe/log path
// so an agent without eyes can read banner state from the demo log.
import { demoLog } from "./demo-log.js";

/** Authored banner UX from a stub phase -> the { pos, collision, hidden } shape installOverlay takes. */
export function bannerUiFromPhase(phase) {
  const ui = {};
  if (phase && phase.titlePos) ui.pos = phase.titlePos;
  if (phase && phase.bannerUi) {
    if (phase.bannerUi.collision !== undefined) ui.collision = !!phase.bannerUi.collision;
    if (phase.bannerUi.hidden !== undefined) ui.hidden = !!phase.bannerUi.hidden;
  }
  return ui;
}

/** Read the live banner: text, position, whether it was moved by ring collision; drains the move log. */
export async function probeBanner(page) {
  return page
    .evaluate(() => {
      const b = __wgById("wg-banner");
      const log = window.__wgBannerLog || [];
      window.__wgBannerLog = [];
      if (!b) return { present: false, log };
      const r = b.getBoundingClientRect();
      const text = b.querySelector(".wg-banner-text");
      return {
        present: true,
        text: text ? text.textContent : "",
        pos: b.dataset.pos || null,
        home: b.dataset.home || null,
        moved: b.dataset.moved || null,
        collision: b.dataset.collision !== "0",
        hidden: b.style.display === "none",
        authored: b.dataset.authored === "1",
        left: Math.round(r.left),
        top: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
        log,
      };
    })
    .catch(() => ({ present: false, log: [] }));
}

export function logBannerDom(tag, p) {
  if (!p) return;
  if (!p.present) {
    demoLog("  " + tag + " banner-dom absent");
    return;
  }
  demoLog(
    "  " + tag + " banner-dom " +
      JSON.stringify(String(p.text || "").slice(0, 60)) +
      "@" + p.pos +
      (p.home && p.home !== p.pos ? " (home=" + p.home + ")" : "") +
      " " + p.left + "," + p.top + " " + p.w + "x" + p.h +
      " collision=" + (p.collision ? "on" : "off") +
      (p.hidden ? " HIDDEN" : "") +
      (p.authored ? " authored" : ""),
  );
  for (const line of p.log || []) demoLog("  " + tag + " banner " + line);
}
