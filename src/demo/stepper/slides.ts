// Slides: a step's multi-page explanation shown after it runs, each page gated by Next.
import type { WgPage } from "../types.js";
import { demoPaceGateMs, formatDemoPaceBadge, formatDemoPaceLabel, normalizeDemoPace, resolveFixtureDwellMs } from "../narration/demo-pace.js";
import { formatHighlightCaption } from "../narration/style.js";
import { normalizeHighlightSize, normalizeHighlightTone, normalizeHighlightWeight, type WaygraphSlide } from "../../engine/stub/ring.js";
import type { DemoPace } from "../../engine/stub/pace.js";
import { installOverlay } from "../overlay/overlay.js";
import { applyHighlightZoom, ensureSelectorInView, hideRing, showRing } from "../overlay/rings.js";
import { demoPaceKind } from "./demo-log.js";
import { envFlag, envNumber, envString } from "../../engine/env.js";

/** Where the slides sit (title, Block, episode) and how fast they advance. */
export interface SlidesOptions {
  title?: string | undefined;
  blockName?: string | undefined;
  episodeNumber?: number | undefined;
  episodeTitle?: string | undefined;
  fast?: boolean | undefined;
  pace?: DemoPace | undefined;
  autoplayMs?: number | undefined;
}

/**
 * Multi-step yap captions - not block lifecycle. Each slide waits for Next
 * (or auto-next), optional ring via slide.selector.
 *
 * Advance wait does NOT use exposeFunction/gate(): after a real navigation
 * (e.g. finish-order -> checkout-complete) the panel can render while
 * __wgNext is momentarily wedged, which left "Next slide" looking live but
 * doing nothing. In-page data-wg-acked + autoplay poll is the source of truth.
 */
export async function presentSlides(page: WgPage, slides: readonly WaygraphSlide[], opts?: SlidesOptions) {
  const title = (opts && opts.title) || "waygraph demo";
  const blockName = (opts && opts.blockName) || "";
  const episodeNumber = opts && opts.episodeNumber;
  const episodeTitle = (opts && opts.episodeTitle) || "";
  const gatesFast = !!(opts && opts.fast);
  const demoPace = normalizeDemoPace((opts && opts.pace) || (gatesFast ? "fast" : "normal"));
  const baseAutoplay =
    opts && opts.autoplayMs
      ? Number(opts.autoplayMs)
      : (envNumber("WAYGRAPH_AUTOPLAY_MS") ?? 1800);
  const autoplayMs = demoPaceGateMs(demoPace, baseAutoplay);
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i]!;
    const caption = formatHighlightCaption(s);
    const slideTone = normalizeHighlightTone(s.tone);
    const slideStyle = {
      size: normalizeHighlightSize(s.size),
      weight: normalizeHighlightWeight(s.weight),
    };
    const isLast = i === slides.length - 1;
    const dwellMs = resolveFixtureDwellMs(s, { gatesFast, pace: demoPace });
    await installOverlay(page, title);
    if (s.selector) {
      try {
        await ensureSelectorInView(page, s.selector);
        await applyHighlightZoom(page, s.selector, s.zoom, undefined);
        // Playwright's own locator (>> piercing / :has-text() / :visible support), not a raw
        // querySelector string - see rings.js's showRing for the same fix, same reason. count()
        // gate: Locator.evaluate() has no timeout option and auto-waits ~30s for a match to
        // appear - count() never waits, keeping this an immediate "does it exist now" check.
        const sLoc = page.locator(s.selector).first();
        const box =
          (await sLoc.count().catch(() => 0)) > 0
            ? await sLoc
                .evaluate((el: HTMLElement) => {
                  const r = el.getBoundingClientRect();
                  return { x: r.x, y: r.y, width: r.width, height: r.height };
                })
                .catch(() => null)
            : null;
        if (box && box.width > 0 && box.height > 0) {
          await showRing(page, box, caption, slideTone, {
            ...slideStyle,
            selector: s.selector,
            focus: false,
          });
        }
      } catch {
        await hideRing(page);
      }
    } else {
      await hideRing(page);
    }
    await page.evaluate(
      (info) => {
        let panel = __wgById("wg-panel");
        const isNew = !panel;
        if (!panel) {
          panel = document.createElement("div");
          panel.id = "wg-panel";
        }
        panel.classList.remove("wg-error", "wg-expected");
        // Do not clear wg-collapsed - WirePanelChrome honors Hide (localStorage)
        // unless forceCollapsed:true (--mini / --video).
        const episodeLine =
          info.episodeNumber !== undefined && info.episodeNumber !== null
            ? __wgEl("div", { class: "wg-episode" }, "Episode " + info.episodeNumber + (info.episodeTitle ? ": " + info.episodeTitle : "") + " · yap slides")
            : null;
        const pace =
          info.paceBadge || info.paceLabel
            ? __wgEl(
                "div",
                { class: "wg-pace", data: { paceKind: info.paceKind || "normal" } },
                __wgEl("span", { class: "wg-pace-badge" }, info.paceBadge || "1x"),
                __wgEl("span", null, info.paceLabel || ""),
              )
            : null;
        const autoplay = __wgEl("input", { id: "wg-autoplay-cb", attrs: { type: "checkbox" } });
        autoplay.checked = !!info.autoNow;
        const run = __wgEl("button", { id: "wg-run", attrs: { type: "button" } }, info.isLast ? "Continue \u25B6" : "Next slide \u25B6");
        run.disabled = info.dwellMs != null;
        __wgSet(
          panel,
          __wgEl(
            "div",
            { class: "wg-chrome" },
            __wgEl("span", { class: "wg-chrome-title" }, "waygraph demo"),
            __wgEl("button", { class: "wg-hide-btn", data: { wgToggle: "1" }, attrs: { type: "button" } }, "Hide"),
          ),
          __wgEl(
            "div",
            { class: "wg-body" },
            episodeLine,
            pace,
            __wgEl("h3", null, "Slide " + (info.index + 1) + " / " + info.total + (info.blockName ? " · " + info.blockName : "")),
            info.tag ? __wgEl("div", { style: "border:none;padding:0;margin:0 0 6px;font-size:11px;color:#c9a6ff" }, info.tag) : null,
            __wgEl("div", { class: "wg-narration" }, String(info.caption)),
            info.detail ? __wgEl("div", { class: "wg-result-pretty", style: "margin:0 0 12px;color:#f0e8ff" }, info.detail) : null,
            info.dwellMs != null
              ? __wgEl("div", { class: "wg-auto", id: "wg-dwell-hint", style: "margin:0 0 8px" }, "Hold " + (info.dwellMs / 1000).toFixed(1) + "s before next...")
              : null,
            __wgEl("div", { class: "wg-autoplay-row" }, __wgEl("label", null, autoplay, " Auto-advance")),
            __wgEl("div", { id: "wg-gate-manual", style: info.autoNow ? "display:none" : "" }, run),
            __wgEl("div", { id: "wg-gate-auto", class: "wg-auto", style: info.autoNow ? "" : "display:none" }, "Auto-advancing..."),
          ),
        );
        if (isNew) {
          __wgAdd(panel);
          requestAnimationFrame(() => panel.classList.add("wg-in"));
        }
        if (window.__wgWirePanelChrome) {
          window.__wgWirePanelChrome(panel, "wg-panel-hidden", "waygraph demo", {
            stepLabel:
              (info.episodeNumber !== undefined && info.episodeNumber !== null
                ? "Ep " + info.episodeNumber + " \u00b7 "
                : "") +
              "Slide " +
              (info.index + 1) +
              " / " +
              info.total +
              (info.blockName ? " \u00b7 " + info.blockName : ""),
            // Video / --mini: compact pill. Else omit so Hide sticks.
            forceCollapsed: info.forceCollapsed === true ? true : undefined,
          });
        }
        if (window.__wgStampModal) {
          window.__wgStampModal(panel, "panel", {
            phase: "slide",
            step: info.index + 1,
            total: info.total,
            block: info.blockName || "",
            ready: true,
          });
        }
        let autoNow = false;
        try {
          autoNow = localStorage.getItem("wg-autoplay") === "1";
        } catch {
          /* ignore */
        }
        const cb = __wgById<HTMLInputElement>("wg-autoplay-cb");
        if (cb) {
          cb.checked = autoNow;
          cb.addEventListener("change", () => {
            try {
              localStorage.setItem("wg-autoplay", cb.checked ? "1" : "0");
            } catch {
              /* ignore */
            }
            const manual = __wgById("wg-gate-manual");
            const auto = __wgById("wg-gate-auto");
            if (manual) manual.style.display = cb.checked ? "none" : "";
            if (auto) auto.style.display = cb.checked ? "" : "none";
          });
        }
        const manual = __wgById("wg-gate-manual");
        const auto = __wgById("wg-gate-auto");
        if (manual) manual.style.display = autoNow ? "none" : "";
        if (auto) auto.style.display = autoNow ? "" : "none";
        const runBtn = __wgById<HTMLButtonElement>("wg-run");
        if (runBtn) {
          runBtn.removeAttribute("data-wg-acked");
          runBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (runBtn.disabled) return;
            runBtn.setAttribute("data-wg-acked", "1");
          });
        }
        if (info.dwellMs != null && info.dwellMs > 0) {
          const unlockAt = Date.now() + info.dwellMs;
          const tick = () => {
            const left = Math.max(0, unlockAt - Date.now());
            const hint = __wgById("wg-dwell-hint");
            const btn = __wgById<HTMLButtonElement>("wg-run");
            if (left <= 0) {
              if (hint) hint.remove();
              if (btn) btn.disabled = false;
              return;
            }
            if (hint) hint.textContent = "Hold " + (left / 1000).toFixed(1) + "s before next...";
            setTimeout(tick, 100);
          };
          setTimeout(tick, 100);
        }
      },
      {
        index: i,
        total: slides.length,
        caption: s.caption,
        detail: s.detail || "",
        tag: s.tag || "",
        blockName,
        isLast,
        autoNow: false,
        dwellMs,
        episodeNumber: episodeNumber !== undefined ? episodeNumber : null,
        episodeTitle,
        paceBadge: formatDemoPaceBadge(demoPace, baseAutoplay),
        paceLabel: formatDemoPaceLabel(demoPace, baseAutoplay),
        paceKind: demoPaceKind(demoPace),
        forceCollapsed:
          !!envString("WAYGRAPH_VIDEO") ||
          envFlag("WAYGRAPH_MINI")
            ? true
            : undefined,
      },
    );
    const started = Date.now();
    // When duration is set: floor both manual Next and auto-next to dwellMs.
    // When unset: auto uses autoplayMs, manual Next is immediate.
    const autoWaitMs = dwellMs != null ? dwellMs : autoplayMs;
    for (;;) {
      const acked = await page
        .evaluate(() => {
          const btn = __wgById<HTMLButtonElement>("wg-run");
          return !!(btn && btn.getAttribute("data-wg-acked") === "1");
        })
        .catch(() => false);
      if (acked) {
        if (dwellMs == null || Date.now() - started >= dwellMs) break;
      }
      const auto = await page
        .evaluate(() => {
          try {
            return localStorage.getItem("wg-autoplay") === "1";
          } catch {
            return false;
          }
        })
        .catch(() => false);
      if (auto && Date.now() - started >= autoWaitMs) break;
      await new Promise((res) => setTimeout(res, 100));
    }
  }
  await hideRing(page);
}
