// Moved verbatim from the former CHAIN_RUNNER_SCRIPT template string in cli.ts (see src/ARCHITECTURE.md).
// Runs inside the target project's own waygraph copy - keep it dependency-light and self-contained.
import { demoPaceGateMs, formatDemoPaceBadge, formatDemoPaceLabel, formatHighlightCaption, normalizeDemoPace, normalizeHighlightSize, normalizeHighlightTone, normalizeHighlightWeight, resolveFixtureDwellMs } from "../highlights.js";
import { installOverlay } from "./overlay-install.js";
import { applyHighlightZoom, ensureSelectorInView, hideRing, showRing } from "./rings.js";
import { demoPaceKind } from "./demo-log.js";

/**
 * Multi-step yap captions - not block lifecycle. Each slide waits for Next
 * (or auto-next), optional ring via slide.selector.
 *
 * Advance wait does NOT use exposeFunction/gate(): after a real navigation
 * (e.g. finish-order -> checkout-complete) the panel can render while
 * __wgNext is momentarily wedged, which left "Next slide" looking live but
 * doing nothing. In-page data-wg-acked + autoplay poll is the source of truth.
 */
export async function presentSlides(page, slides, _gate, opts) {
  const title = (opts && opts.title) || "waygraph demo";
  const blockName = (opts && opts.blockName) || "";
  const episodeNumber = opts && opts.episodeNumber;
  const episodeTitle = (opts && opts.episodeTitle) || "";
  const gatesFast = !!(opts && opts.fast);
  const demoPace = normalizeDemoPace((opts && opts.pace) || (gatesFast ? "fast" : "normal"));
  const baseAutoplay =
    opts && opts.autoplayMs
      ? Number(opts.autoplayMs)
      : process.env.WAYGRAPH_AUTOPLAY_MS
        ? Number(process.env.WAYGRAPH_AUTOPLAY_MS)
        : 1800;
  const autoplayMs = demoPaceGateMs(demoPace, baseAutoplay);
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
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
        await applyHighlightZoom(page, s.selector, s.zoom, s.zoomOut);
        const box = await page
          .evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          }, s.selector)
          .catch(() => null);
        if (box && box.width > 0 && box.height > 0) {
          await showRing(page, box, caption, slideTone, {
            ...slideStyle,
            selector: s.selector,
            focus: !!s.focus,
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
        const esc = (t) =>
          String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
        const episodeLine =
          info.episodeNumber !== undefined && info.episodeNumber !== null
            ? "<div class=\"wg-episode\">Episode " +
              info.episodeNumber +
              (info.episodeTitle ? ": " + esc(info.episodeTitle) : "") +
              " · yap slides</div>"
            : "";
        const paceHtml =
          info.paceBadge || info.paceLabel
            ? "<div class=\"wg-pace\" data-pace-kind=\"" +
              esc(info.paceKind || "normal") +
              "\"><span class=\"wg-pace-badge\">" +
              esc(info.paceBadge || "1x") +
              "</span><span>" +
              esc(info.paceLabel || "") +
              "</span></div>"
            : "";
        panel.innerHTML =
          "<div class=\"wg-chrome\"><span class=\"wg-chrome-title\">waygraph demo</span>" +
          "<button type=\"button\" class=\"wg-hide-btn\" data-wg-toggle=\"1\">Hide</button></div>" +
          "<div class=\"wg-body\">" +
          episodeLine +
          paceHtml +
          "<h3>Slide " +
          (info.index + 1) +
          " / " +
          info.total +
          (info.blockName ? " · " + esc(info.blockName) : "") +
          "</h3>" +
          (info.tag
            ? "<div style=\"border:none;padding:0;margin:0 0 6px;font-size:11px;color:#c9a6ff\">" +
              esc(info.tag) +
              "</div>"
            : "") +
          "<div class=\"wg-narration\">" +
          esc(info.caption) +
          "</div>" +
          (info.detail
            ? "<div class=\"wg-result-pretty\" style=\"margin:0 0 12px;color:#f0e8ff\">" +
              esc(info.detail) +
              "</div>"
            : "") +
          (info.dwellMs != null
            ? "<div class=\"wg-auto\" id=\"wg-dwell-hint\" style=\"margin:0 0 8px\">Hold " +
              (info.dwellMs / 1000).toFixed(1) +
              "s before next...</div>"
            : "") +
          "<div class=\"wg-autoplay-row\"><label><input type=\"checkbox\" id=\"wg-autoplay-cb\"" +
          (info.autoNow ? " checked" : "") +
          "> Auto-advance</label></div>" +
          "<div id=\"wg-gate-manual\"" +
          (info.autoNow ? " style=\"display:none\"" : "") +
          "><button type=\"button\" id=\"wg-run\"" +
          (info.dwellMs != null ? " disabled" : "") +
          ">" +
          (info.isLast ? "Continue \u25B6" : "Next slide \u25B6") +
          "</button></div>" +
          "<div id=\"wg-gate-auto\" class=\"wg-auto\"" +
          (info.autoNow ? "" : " style=\"display:none\"") +
          ">Auto-advancing...</div>" +
          "</div>";
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
        const cb = __wgById("wg-autoplay-cb");
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
        const runBtn = __wgById("wg-run");
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
            const btn = __wgById("wg-run");
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
          !!process.env.WAYGRAPH_VIDEO ||
          process.env.WAYGRAPH_MINI === "1" ||
          process.env.WAYGRAPH_STEPPER_MINI === "1"
            ? true
            : undefined,
      },
    );
    const started = Date.now();
    // When duration is set: floor both manual Next and auto-next to dwellMs.
    // When unset: legacy - auto uses autoplayMs, manual Next is immediate.
    const autoWaitMs = dwellMs != null ? dwellMs : autoplayMs;
    for (;;) {
      const acked = await page
        .evaluate(() => {
          const btn = __wgById("wg-run");
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
