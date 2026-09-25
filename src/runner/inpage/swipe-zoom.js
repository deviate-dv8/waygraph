// In-page installer (runs inside the browser via page.evaluate): must stay self-contained - no module-scope closure.
// Split out of the former single installOverlay evaluate (see src/ARCHITECTURE.md). Shares state only via window.__wg*.
/* eslint-disable no-unused-vars */
export function installSwipeZoom({ title, favicon, bannerPos, todoPos, envAutoplay, todoDockUi }) {
        /**
         * Finger swipe trail for touch theater (orientation rotate / device change).
         * opts: { dir: 'left'|'right'|'up'|'down', label?, ms? }
         * Returns duration waited (ms) via Promise when called from page.evaluate async.
         */
        window.__wgSwipeTrail = (opts) => {
          const o = opts || {};
          const dir = o.dir === "right" || o.dir === "up" || o.dir === "down" ? o.dir : "left";
          const ms = Math.max(280, Math.min(1400, Number(o.ms) || 720));
          const label =
            o.label ||
            (dir === "left" || dir === "right" ? "swipe" : "swipe") +
              (o.hint ? " \u00b7 " + o.hint : "");
          let layer = document.getElementById("wg-swipe-layer");
          if (layer && layer._wgTimer) {
            clearTimeout(layer._wgTimer);
            layer._wgTimer = null;
          }
          if (layer) layer.remove();
          layer = document.createElement("div");
          layer.id = "wg-swipe-layer";
          layer.setAttribute("data-wg-ui", "1");
          const finger = document.createElement("div");
          finger.className = "wg-swipe-finger";
          const lab = document.createElement("div");
          lab.className = "wg-swipe-label";
          lab.textContent = label;
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
          finger.style.opacity = "1";
          void layer.offsetWidth;
          layer.classList.add("wg-in");
          const steps = 12;
          const stepMs = Math.floor(ms / steps);
          let i = 0;
          const tick = () => {
            i += 1;
            const t = Math.min(1, i / steps);
            const e = t * t * (3 - 2 * t);
            const x = x0 + (x1 - x0) * e;
            const y = y0 + (y1 - y0) * e;
            finger.style.left = x + "px";
            finger.style.top = y + "px";
            const dot = document.createElement("div");
            dot.className = "wg-swipe-dot";
            dot.style.left = x + "px";
            dot.style.top = y + "px";
            dot.style.opacity = String(0.85 - t * 0.55);
            layer.appendChild(dot);
            requestAnimationFrame(() => {
              dot.style.transition = "opacity .45s ease, transform .45s ease";
              dot.style.opacity = "0";
              dot.style.transform = "scale(1.8)";
            });
            if (i < steps) {
              layer._wgTimer = setTimeout(tick, stepMs);
            } else {
              finger.style.opacity = "0";
              layer.classList.remove("wg-in");
              layer._wgTimer = setTimeout(() => {
                const el = document.getElementById("wg-swipe-layer");
                if (el) el.remove();
              }, 380);
            }
          };
          layer._wgTimer = setTimeout(tick, 40);
          return ms + 120;
        };
        window.__wgClearZoom = () => {
          // Strip leftover element transforms from older zoom path.
          document.querySelectorAll("[data-wg-zoomed=\"1\"]").forEach((el) => {
            el.style.removeProperty("transform");
            el.style.removeProperty("transform-origin");
            el.style.removeProperty("transition");
            el.style.removeProperty("z-index");
            el.style.removeProperty("position");
            delete el.dataset.wgZoomed;
          });
          // Undo any prior shell-camera experiment - restore device fit scale only.
          const shell = document.getElementById("wg-device-shell");
          if (shell && shell.dataset.wgCamBase != null) {
            shell.style.transform = shell.dataset.wgCamBase;
            if (shell.dataset.wgCamOrigin) {
              shell.style.transformOrigin = shell.dataset.wgCamOrigin;
            } else {
              shell.style.transformOrigin = "center center";
            }
            delete shell.dataset.wgCamBase;
            delete shell.dataset.wgCamOrigin;
            delete shell.dataset.wgCamZoom;
          }
          window.__wgZoomLevel = 1;
          window.__wgZoomSel = "";
          if (window.__wgSetZoomBadge) window.__wgSetZoomBadge(1, "");
        };
        const ZOOM_ICO =
          '<svg viewBox="0 0 24 24" fill="none" stroke="#fde68a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
        window.__wgSetZoomBadge = (scale, sel) => {
          const n = Number(scale);
          const level = Number.isFinite(n) && n > 0 ? n : 1;
          let badge = document.getElementById("wg-zoom-badge");
          if (!badge) {
            badge = document.createElement("div");
            badge.id = "wg-zoom-badge";
            badge.setAttribute("data-wg-ui", "1");
            document.documentElement.appendChild(badge);
          }
          const zoomed = level > 1.001 || level < 0.999;
          badge.dataset.zoomed = zoomed ? "1" : "0";
          const txt = level.toFixed(2) + "\u00d7";
          badge.innerHTML =
            '<span class="wg-zoom-ico">' +
            ZOOM_ICO +
            '</span><span class="wg-zoom-val">' +
            txt +
            "</span>";
          badge.classList.add("wg-in");
          window.__wgZoomLevel = level;
          window.__wgZoomSel = sel || "";
        };
        window.__wgEnsureZoomBadge = () => {
          if (window.__wgSetZoomBadge) {
            window.__wgSetZoomBadge(window.__wgZoomLevel || 1, window.__wgZoomSel || "");
          }
        };
        window.__wgSetTypingBadge = (on, label) => {
          let badge = document.getElementById("wg-typing-badge");
          if (!on) {
            if (badge) {
              badge.classList.remove("wg-in");
              setTimeout(() => {
                const b = document.getElementById("wg-typing-badge");
                if (b && !b.classList.contains("wg-in")) b.remove();
              }, 220);
            }
            return;
          }
          if (!badge) {
            badge = document.createElement("div");
            badge.id = "wg-typing-badge";
            badge.setAttribute("data-wg-ui", "1");
            document.documentElement.appendChild(badge);
          }
          const text = label ? String(label).slice(0, 40) : "typing";
          badge.innerHTML =
            '<span class="wg-ty-dots">\u25cf\u25cf\u25cf</span><span>typing \u00b7 ' +
            text.replace(/</g, "&lt;") +
            "</span>";
          void badge.offsetWidth;
          badge.classList.add("wg-in");
        };
        /**
         * Zoom HUD only - never CSS-scale the target or the device shell.
         * Shell camera zoom fought device-theater fit-scale (broke ring follow
         * + uneven border-radius). Element scale mangled cart rows. Emphasis
         * is ring + focus veil; badge still shows authored zoom level.
         */
        window.__wgApplyZoom = (sel, scale) => {
          document.querySelectorAll("[data-wg-zoomed=\"1\"]").forEach((el) => {
            el.style.removeProperty("transform");
            el.style.removeProperty("transform-origin");
            el.style.removeProperty("transition");
            el.style.removeProperty("z-index");
            el.style.removeProperty("position");
            delete el.dataset.wgZoomed;
          });
          const shell = document.getElementById("wg-device-shell");
          if (shell && shell.dataset.wgCamBase != null) {
            shell.style.transform = shell.dataset.wgCamBase;
            shell.style.transformOrigin = shell.dataset.wgCamOrigin || "center center";
            delete shell.dataset.wgCamBase;
            delete shell.dataset.wgCamOrigin;
            delete shell.dataset.wgCamZoom;
          }
          const n = Number(scale);
          if (!Number.isFinite(n) || n <= 1.001) {
            window.__wgZoomLevel = 1;
            window.__wgZoomSel = "";
            if (window.__wgSetZoomBadge) window.__wgSetZoomBadge(1, "");
            return;
          }
          window.__wgZoomLevel = n;
          window.__wgZoomSel = sel || "";
          if (window.__wgSetZoomBadge) window.__wgSetZoomBadge(n, sel || "");
        };
        // Mount zoom HUD immediately so demos always show 1.00x.
        if (window.__wgEnsureZoomBadge) window.__wgEnsureZoomBadge();
}
