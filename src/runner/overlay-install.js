// Moved verbatim from the former CHAIN_RUNNER_SCRIPT template string in cli.ts (see src/ARCHITECTURE.md).
// Runs inside the target project's own waygraph copy - keep it dependency-light and self-contained.
import { RING_CSS, WAYGRAPH_FAVICON } from "./overlay-css.js";
import { resolveTodoDockUi } from "../highlights.js";
import { join } from "node:path";
import { applyVideoDeviceStage } from "./device-stage.js";

export async function installOverlay(page, title) {
  await page.addStyleTag({ content: RING_CSS }).catch(() => {});
  // Default top-left; override with WAYGRAPH_TITLE_POS=left|center|right.
  // Click cycles left -> center -> right (persisted in localStorage so a
  // navigation that rebuilds the banner keeps the human's last pick).
  const envPos = (process.env.WAYGRAPH_TITLE_POS || "left").toLowerCase();
  const bannerPos = envPos === "center" || envPos === "right" ? envPos : "left";
  const envTodoPos = (process.env.WAYGRAPH_TODO_POS || "left").toLowerCase();
  const todoPos = envTodoPos === "right" ? "right" : "left";
  const envAutoplay = process.env.WAYGRAPH_AUTOPLAY === "1";
  const todoDockUi = resolveTodoDockUi();
  await page
    .evaluate(
      ({ title, favicon, bannerPos, todoPos, envAutoplay, todoDockUi }) => {
        window.__wgTodoDockUi = todoDockUi || {
          compact: true,
          cap: 5,
          expandCap: 14,
          collision: true,
          behindRing: true,
        };
        // Seed the live autoplay toggle from the env default on first ever
        // load only - a real navigation re-runs this, and re-stamping here
        // would silently undo a human's mid-run checkbox click.
        try {
          if (localStorage.getItem("wg-autoplay") === null) {
            localStorage.setItem("wg-autoplay", envAutoplay ? "1" : "0");
          }
        } catch {
          /* private mode / blocked storage - falls back to manual gating */
        }
        if (!document.getElementById("wg-ring")) {
          const ring = document.createElement("div");
          ring.id = "wg-ring";
          document.documentElement.appendChild(ring);
        }
        if (!document.getElementById("wg-ring-label")) {
          const ringLabel = document.createElement("div");
          ringLabel.id = "wg-ring-label";
          document.documentElement.appendChild(ringLabel);
        }
        if (!document.getElementById("wg-cursor")) {
          const cursor = document.createElement("div");
          cursor.id = "wg-cursor";
          // Dark fill + white stroke, same as help-center-clip-engine's own
          // #clip-cursor - visible against any page background, light or
          // dark, unlike a plain solid-white shape.
          cursor.innerHTML =
            "<svg viewBox='0 0 32 32' width='24' height='24'>" +
            "<path fill='#0C0C1A' stroke='#fff' stroke-width='1.4' stroke-linejoin='round' " +
            "d='M6 3.5l1.4 22.5 5.8-5.4 4.2 9.4 3.6-1.6-4.2-9.2H26z'/></svg>";
          document.documentElement.appendChild(cursor);
        }
        if (!document.getElementById("wg-click-pulse")) {
          const pulse = document.createElement("div");
          pulse.id = "wg-click-pulse";
          document.documentElement.appendChild(pulse);
        }
        window.__wgMoveCursorTo = (x, y, ms, instant) => {
          const cursor = document.getElementById("wg-cursor");
          if (!cursor) return;
          cursor.style.setProperty("--wg-cursor-ms", (ms || 600) + "ms");
          if (instant) {
            const prev = cursor.style.transition;
            cursor.style.transition = "none";
            cursor.style.transform = "translate(" + x + "px," + y + "px)";
            void cursor.offsetWidth;
            cursor.style.transition = prev || "";
          } else {
            cursor.style.transform = "translate(" + x + "px," + y + "px)";
          }
          cursor.style.opacity = "1";
        };
        window.__wgHideCursor = () => {
          const cursor = document.getElementById("wg-cursor");
          if (cursor) cursor.style.opacity = "0";
        };
        window.__wgPositionRing = (box, label, tone, style) => {
          const ring = document.getElementById("wg-ring");
          const ringLabel = document.getElementById("wg-ring-label");
          if (!ring || !ringLabel || !box) return;
          const raw = (tone || "planned") + "";
          const t =
            raw === "auto" || raw === "info" || raw === "warning" || raw === "danger" || raw === "success"
              ? raw
              : "planned";
          const st = style && typeof style === "object" ? style : {};
          const sizeRaw = (st.size || "md") + "";
          const size =
            sizeRaw === "sm" || sizeRaw === "lg" ? sizeRaw : "md";
          const weightRaw = (st.weight || "normal") + "";
          const weight = weightRaw === "bold" ? "bold" : "normal";
          ring.dataset.tone = t;
          ringLabel.dataset.tone = t;
          ring.dataset.size = size;
          ringLabel.dataset.size = size;
          ringLabel.dataset.weight = weight;
          const pad = size === "sm" ? 3 : size === "lg" ? 10 : 6;
          const margin = 6;
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          // Pin ring EXACTLY to the element - never clamp the ring away from
          // the target (that looked "strapped on" the viewport).
          const left = box.x - pad;
          const top = box.y - pad;
          const width = Math.max(4, box.width + pad * 2);
          const height = Math.max(4, box.height + pad * 2);
          ring.style.left = left + "px";
          ring.style.top = top + "px";
          ring.style.width = width + "px";
          ring.style.height = height + "px";
          ring.style.opacity = "1";
          ringLabel.textContent = label || "";
          ringLabel.style.opacity = "1";
          const lw = ringLabel.offsetWidth;
          const lh = ringLabel.offsetHeight;
          let labelLeft = left;
          let labelTop = top + height + 8;
          if (labelTop + lh > vh - margin) labelTop = top - lh - 8;
          if (labelTop < margin) labelTop = margin;
          if (labelLeft + lw > vw - margin) labelLeft = Math.max(margin, vw - margin - lw);
          if (labelLeft < margin) labelLeft = margin;
          ringLabel.style.left = labelLeft + "px";
          ringLabel.style.top = labelTop + "px";
          if (window.__wgTodosSetBehind) window.__wgTodosSetBehind(true);
          if (window.__wgTodosAvoidRingCollision) window.__wgTodosAvoidRingCollision(box);
        };
        /** Dim/lower floating todo docks while a ring caption is the focus. */
        window.__wgTodosSetBehind = (on) => {
          const ui = window.__wgTodoDockUi || {};
          if (ui.behindRing === false) {
            document.querySelectorAll(".wg-todo-dock, #wg-todo-dock").forEach((el) => {
              el.classList.remove("wg-todo-behind");
            });
            return;
          }
          document.querySelectorAll(".wg-todo-dock, #wg-todo-dock").forEach((el) => {
            el.classList.toggle("wg-todo-behind", !!on);
          });
        };
        /**
         * If the active ring box intersects a todo dock, flip L/R once.
         * Locked until hideRing so follow-rAF does not thrash.
         */
        window.__wgTodosAvoidRingCollision = (box) => {
          const ui = window.__wgTodoDockUi || {};
          if (ui.collision === false) return;
          if (!box || window.__wgTodoCollisionLocked) return;
          const pad = 10;
          const rx1 = box.x - pad;
          const ry1 = box.y - pad;
          const rx2 = box.x + box.width + pad;
          const ry2 = box.y + box.height + pad;
          const overlaps = (el) => {
            const r = el.getBoundingClientRect();
            return !(r.right < rx1 || r.left > rx2 || r.bottom < ry1 || r.top > ry2);
          };
          const docks = [...document.querySelectorAll(".wg-todo-dock, #wg-todo-dock")].filter(
            (el, i, arr) => arr.indexOf(el) === i,
          );
          for (const dock of docks) {
            if (!overlaps(dock)) continue;
            const cur = dock.dataset.pos === "right" ? "right" : "left";
            dock.dataset.pos = cur === "right" ? "left" : "right";
            try {
              localStorage.setItem("wg-todo-pos", dock.dataset.pos);
            } catch {
              /* ignore */
            }
            // Still colliding after flip - tuck (shorter max-height).
            if (overlaps(dock)) dock.dataset.tucked = "1";
            else delete dock.dataset.tucked;
            window.__wgTodoCollisionLocked = true;
            break;
          }
        };
        /** Live-follow a selector with rAF (accurate under device shell scale). */
        window.__wgStopRingFollow = () => {
          if (window.__wgRingFollowRaf) {
            cancelAnimationFrame(window.__wgRingFollowRaf);
            window.__wgRingFollowRaf = 0;
          }
          window.__wgRingFollowSel = "";
        };
        window.__wgFollowRing = (sel, label, tone, style, focus) => {
          window.__wgStopRingFollow();
          if (!sel) return;
          window.__wgRingFollowSel = sel;
          const tick = () => {
            if (window.__wgRingFollowSel !== sel) return;
            const el = document.querySelector(sel);
            if (!el) {
              window.__wgRingFollowRaf = requestAnimationFrame(tick);
              return;
            }
            const r = el.getBoundingClientRect();
            const box = { x: r.x, y: r.y, width: r.width, height: r.height };
            if (window.__wgPositionRing) {
              window.__wgPositionRing(box, label, tone || "planned", style || {});
            }
            if (focus && window.__wgApplyFocus) window.__wgApplyFocus(box);
            window.__wgRingFollowRaf = requestAnimationFrame(tick);
          };
          tick();
        };
        window.__wgClickPulse = (x, y, tone) => {
          const pulse = document.getElementById("wg-click-pulse");
          if (!pulse) return;
          const raw = (tone || "planned") + "";
          pulse.dataset.tone =
            raw === "auto" || raw === "info" || raw === "warning" || raw === "danger" || raw === "success"
              ? raw
              : "planned";
          pulse.style.left = x + "px";
          pulse.style.top = y + "px";
          pulse.classList.remove("wg-pulse");
          void pulse.offsetWidth;
          pulse.classList.add("wg-pulse");
        };
        window.__wgHideRing = (opts) => {
          // While a narrate() call owns the ring (mid multi-step action),
          // the auto-highlight click/fill patches' own end-of-step hide is
          // a no-op - narrate() itself clears it once the WHOLE wrapped
          // action finishes, not just its first sub-step.
          if (window.__wgNarrateOwnsRing) return;
          if (window.__wgStopRingFollow) window.__wgStopRingFollow();
          const ring = document.getElementById("wg-ring");
          const ringLabel = document.getElementById("wg-ring-label");
          if (ring) ring.style.opacity = "0";
          if (ringLabel) ringLabel.style.opacity = "0";
          if (window.__wgClearFocus) window.__wgClearFocus();
          if (window.__wgTodosSetBehind) window.__wgTodosSetBehind(false);
          window.__wgTodoCollisionLocked = false;
          document.querySelectorAll(".wg-todo-dock[data-tucked], #wg-todo-dock[data-tucked]").forEach((el) => {
            delete el.dataset.tucked;
          });
          // Honor zoomOut:false - keep camera until next zoom / desktop clear.
          const forceClear = opts && opts.clearZoom === true;
          const skipClear = opts && opts.clearZoom === false;
          if (
            !skipClear &&
            (forceClear || window.__wgZoomOutOnHide !== false) &&
            window.__wgClearZoom
          ) {
            window.__wgClearZoom();
          }
        };
        window.__wgClearFocus = () => {
          const veil = document.getElementById("wg-focus-veil");
          if (!veil) return;
          veil.classList.remove("wg-in");
          setTimeout(() => {
            const v = document.getElementById("wg-focus-veil");
            if (v && !v.classList.contains("wg-in")) v.remove();
          }, 320);
        };
        window.__wgApplyFocus = (box) => {
          if (!box) {
            if (window.__wgClearFocus) window.__wgClearFocus();
            return;
          }
          let veil = document.getElementById("wg-focus-veil");
          if (!veil) {
            veil = document.createElement("div");
            veil.id = "wg-focus-veil";
            veil.setAttribute("data-wg-ui", "1");
            document.documentElement.appendChild(veil);
          }
          const pad = 10;
          veil.style.left = Math.max(0, box.x - pad) + "px";
          veil.style.top = Math.max(0, box.y - pad) + "px";
          veil.style.width = Math.max(8, box.width + pad * 2) + "px";
          veil.style.height = Math.max(8, box.height + pad * 2) + "px";
          void veil.offsetWidth;
          veil.classList.add("wg-in");
        };
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
        const POSITIONS = ["left", "center", "right"];
        const applyPos = (el, pos) => {
          el.dataset.pos = pos;
          try {
            localStorage.setItem("wg-banner-pos", pos);
          } catch {
            /* private mode / blocked storage - position still applies this page */
          }
        };
        if (title) {
          let banner = document.getElementById("wg-banner");
          if (!banner) {
            banner = document.createElement("div");
            banner.id = "wg-banner";
            let saved = null;
            try {
              saved = localStorage.getItem("wg-banner-pos");
            } catch {
              /* ignore */
            }
            const startPos =
              saved && POSITIONS.includes(saved) ? saved : bannerPos;
            applyPos(banner, startPos);
            banner.title = "Click to move: top left / center / right";
            banner.addEventListener("click", (e) => {
              e.stopPropagation();
              const i = POSITIONS.indexOf(banner.dataset.pos || "left");
              applyPos(banner, POSITIONS[(i + 1) % POSITIONS.length]);
            });
            const tag = document.createElement("span");
            tag.className = "wg-banner-tag";
            tag.textContent = "waygraph demo";
            const text = document.createElement("span");
            text.className = "wg-banner-text";
            text.textContent = title;
            banner.appendChild(tag);
            banner.appendChild(text);
            document.documentElement.appendChild(banner);
          } else {
            // Fixture / episode title changes every step - update in place
            // (banner is created once; do not leave the first step's text stuck).
            let text = banner.querySelector(".wg-banner-text");
            if (!text) {
              text = document.createElement("span");
              text.className = "wg-banner-text";
              banner.appendChild(text);
            }
            text.textContent = title;
          }
        }
        // Tab title/favicon: a real navigation resets document.title and any
        // <link rel="icon"> the new document brings, so re-check (not
        // re-append) on every call instead of a one-time flag.
        if (!document.title.startsWith("[waygraph] ")) {
          document.title = "[waygraph] " + document.title;
        }
        let iconLink = document.querySelector("link[rel~='icon']");
        if (!iconLink) {
          iconLink = document.createElement("link");
          iconLink.rel = "icon";
          document.head.appendChild(iconLink);
        }
        if (iconLink.href !== favicon) iconLink.href = favicon;
        // Blind-agent overlay beacons: every modal root gets data-wg-ui /
        // data-wg-modal / data-wg-ready so tests can fail on a blank panel.
        window.__wgStampModal = (el, kind, meta) => {
          if (!el) return;
          meta = meta || {};
          el.setAttribute("data-wg-ui", "1");
          el.setAttribute("data-wg-modal", kind || "panel");
          if (meta.phase != null) el.setAttribute("data-wg-phase", String(meta.phase));
          if (meta.step != null) el.setAttribute("data-wg-step", String(meta.step));
          if (meta.total != null) el.setAttribute("data-wg-total", String(meta.total));
          if (meta.block != null) el.setAttribute("data-wg-block", String(meta.block));
          el.setAttribute(
            "data-wg-collapsed",
            el.classList.contains("wg-collapsed") ? "1" : "0",
          );
          el.setAttribute("data-wg-ready", meta.ready === false ? "0" : "1");
        };
        window.__wgOverlayBeacon = () => {
          return Array.from(document.querySelectorAll("[data-wg-ui=\"1\"]")).map((el) => {
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
                el.getAttribute("data-wg-collapsed") === "1" ||
                el.classList.contains("wg-collapsed"),
              opacity: st.opacity,
              textLen: (el.innerText || "").trim().length,
              w: Math.round(r.width),
              h: Math.round(r.height),
              visible: r.width > 0 && r.height > 0 && Number(st.opacity) > 0.05,
            };
          });
        };
        const existingBanner = document.getElementById("wg-banner");
        if (existingBanner) window.__wgStampModal(existingBanner, "banner", { ready: true });
        // Hide/Show for #wg-panel - call after every panel.innerHTML refresh.
        // Collapsed = "N / M · block" + Next (when not auto). Never pass
        // forceCollapsed:false - omit so Hide/localStorage wins.
        window.__wgWirePanelChrome = (panel, storageKey, chromeTitle, opts) => {
          if (!panel) return;
          opts = opts || {};
          const ensureChrome = () => {
            let chrome = panel.querySelector(":scope > .wg-chrome");
            if (!chrome) {
              const body = document.createElement("div");
              body.className = "wg-body";
              while (panel.firstChild) body.appendChild(panel.firstChild);
              chrome = document.createElement("div");
              chrome.className = "wg-chrome";
              const titleEl = document.createElement("span");
              titleEl.className = "wg-chrome-title";
              titleEl.textContent = chromeTitle || "waygraph demo";
              const actions = document.createElement("div");
              actions.className = "wg-chrome-actions";
              const nextBtn = document.createElement("button");
              nextBtn.type = "button";
              nextBtn.className = "wg-mini-next";
              nextBtn.setAttribute("data-wg-mini-next", "1");
              nextBtn.textContent = "Next ▶";
              const btn = document.createElement("button");
              btn.type = "button";
              btn.className = "wg-hide-btn";
              btn.setAttribute("data-wg-toggle", "1");
              btn.textContent = "Hide";
              actions.appendChild(nextBtn);
              actions.appendChild(btn);
              chrome.appendChild(titleEl);
              chrome.appendChild(actions);
              panel.appendChild(chrome);
              panel.appendChild(body);
              return;
            }
            // Yap slides ship a bare chrome - ensure actions + mini Next exist.
            let actions = chrome.querySelector(".wg-chrome-actions");
            if (!actions) {
              actions = document.createElement("div");
              actions.className = "wg-chrome-actions";
              const hide = chrome.querySelector("[data-wg-toggle]");
              if (hide) actions.appendChild(hide);
              chrome.appendChild(actions);
            }
            if (!actions.querySelector("[data-wg-mini-next]")) {
              const nextBtn = document.createElement("button");
              nextBtn.type = "button";
              nextBtn.className = "wg-mini-next";
              nextBtn.setAttribute("data-wg-mini-next", "1");
              nextBtn.textContent = "Next ▶";
              actions.insertBefore(nextBtn, actions.firstChild);
            }
          };
          ensureChrome();
          const stepLabel = opts.stepLabel || panel.dataset.wgStepLabel || "";
          if (stepLabel) panel.dataset.wgStepLabel = stepLabel;
          const syncMiniNext = (hidden) => {
            const miniNext = panel.querySelector("[data-wg-mini-next]");
            if (!miniNext) return;
            let auto = false;
            try {
              auto = localStorage.getItem("wg-autoplay") === "1";
            } catch {
              /* ignore */
            }
            const runBtn = document.getElementById("wg-run");
            const show = !!hidden && !auto && !!runBtn;
            miniNext.classList.toggle("wg-mini-next-show", show);
            if (runBtn) {
              miniNext.textContent = runBtn.textContent || "Next ▶";
              miniNext.disabled = !!runBtn.disabled;
            } else {
              miniNext.disabled = true;
            }
          };
          const apply = (hidden, persist) => {
            panel.classList.toggle("wg-collapsed", hidden);
            panel.setAttribute("data-wg-collapsed", hidden ? "1" : "0");
            const t = panel.querySelector("[data-wg-toggle]");
            const titleEl = panel.querySelector(".wg-chrome-title");
            const label = panel.dataset.wgStepLabel || stepLabel;
            if (titleEl) {
              titleEl.textContent = hidden
                ? (label || chromeTitle || "waygraph demo")
                : (chromeTitle || "waygraph demo");
            }
            if (t) t.textContent = hidden ? "Show" : "Hide";
            syncMiniNext(hidden);
            if (persist !== false) {
              try {
                localStorage.setItem(storageKey, hidden ? "1" : "0");
              } catch {
                /* private mode */
              }
            }
          };
          let hidden = false;
          if (opts.forceCollapsed === true) {
            hidden = true;
          } else {
            try {
              hidden = localStorage.getItem(storageKey) === "1";
            } catch {
              /* ignore */
            }
          }
          // force mini does not overwrite Hide preference in storage.
          apply(hidden, opts.forceCollapsed === true ? false : true);
          const toggle = panel.querySelector("[data-wg-toggle]");
          if (toggle && !toggle.dataset.wgWired) {
            toggle.dataset.wgWired = "1";
            toggle.addEventListener("click", (e) => {
              e.stopPropagation();
              apply(!panel.classList.contains("wg-collapsed"), true);
            });
          }
          const miniNext = panel.querySelector("[data-wg-mini-next]");
          if (miniNext && !miniNext.dataset.wgWired) {
            miniNext.dataset.wgWired = "1";
            miniNext.addEventListener("click", (e) => {
              e.stopPropagation();
              const runBtn = document.getElementById("wg-run");
              if (runBtn && !runBtn.disabled) {
                runBtn.click();
                return;
              }
              if (typeof window.__wgNext === "function") window.__wgNext({});
            });
          }
          const autoCb = document.getElementById("wg-autoplay-cb");
          if (autoCb && !autoCb.dataset.wgMiniWired) {
            autoCb.dataset.wgMiniWired = "1";
            autoCb.addEventListener("change", () => {
              syncMiniNext(panel.classList.contains("wg-collapsed"));
            });
          }
          const cur = panel.querySelector("#wg-modules .wg-mod-current");
          if (cur && typeof cur.scrollIntoView === "function") {
            try {
              cur.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
            } catch {
              cur.scrollIntoView(false);
            }
          }
        };
        // Floating todo dock - lives outside #wg-panel so --mini / Hide never
        // hide the checklist. Click cycles left <-> right with CSS transform.
        // Authors set side via ctx.todoPos("left"|"right"); env / --todo-* fallback.
        // Payload:
        //   { sync: "clear" }                         -> remove dock
        //   { sync: "keep" }                          -> leave dock alone (no wipe)
        //   { sync: "set", dock } / { sync:"set", list } -> render / recreate
        // Compat: bare array = set list (empty array = clear - legacy only).
        window.__wgSyncTodos = (payload, pos) => {
          const syncPayload = payload;
          let sync = "set";
          let list = [];
          let dockState = null;
          let wantPos =
            pos === "left" || pos === "right" ? pos : null;
          if (Array.isArray(payload)) {
            list = payload;
            sync = list.length ? "set" : "clear";
          } else if (payload && typeof payload === "object") {
            sync = payload.sync === "clear" || payload.sync === "keep" ? payload.sync : "set";
            dockState = payload.dock || null;
            if (payload.pos === "left" || payload.pos === "right") wantPos = payload.pos;
            if (Array.isArray(payload.list)) list = payload.list;
            else if (dockState && Array.isArray(dockState.groups)) {
              // Flatten for legacy callers; full dock rendered below when present.
              list = [];
              for (const g of dockState.groups) {
                if (g && Array.isArray(g.items)) list = list.concat(g.items);
              }
            }
          } else {
            list = [];
            sync = "clear";
          }

          let dockKey =
            (dockState && dockState.id && String(dockState.id).trim()) ||
            (payload && !Array.isArray(payload) && payload.todoId && String(payload.todoId).trim()) ||
            "_default";

          // Drop any in-panel leftover (old builds put #wg-todos in .wg-body).
          document.querySelectorAll("#wg-panel #wg-todos").forEach((el) => el.remove());

          const allDocks = () =>
            [...document.querySelectorAll(".wg-todo-dock, #wg-todo-dock")].filter(
              (el, i, arr) => arr.indexOf(el) === i,
            );
          const relayoutTodoDocks = () => {
            const docks = allDocks();
            let top = 72;
            for (const el of docks) {
              el.style.top = top + "px";
              top += Math.max(48, el.getBoundingClientRect().height) + 10;
            }
          };
          const findDock = (key) => {
            if (key === "_default") {
              return (
                document.querySelector('.wg-todo-dock[data-wg-todo-key="_default"]') ||
                document.getElementById("wg-todo-dock")
              );
            }
            const all = document.querySelectorAll(".wg-todo-dock");
            for (let i = 0; i < all.length; i++) {
              if (all[i].getAttribute("data-wg-todo-key") === String(key)) return all[i];
            }
            return null;
          };

          // keep + no new payload: do not remove existing docks (PIA #10).
          if (sync === "keep") {
            if (!dockState && !list.length) return;
            // After navigation the DOM may be gone - recreate from carried dock.
            sync = "set";
          }
          // Default replace=true: one checklist. parallel docks only when replace:false.
          const replace =
            !(payload && !Array.isArray(payload) && payload.replace === false) &&
            !(payload && !Array.isArray(payload) && payload.parallel === true);
          const hasDock =
            !!(dockState && Array.isArray(dockState.groups) && dockState.groups.length);
          // Explicit clear only - never treat "set + dock + empty list" as clear
          // (that thrash was marks -> blank in a few ms).
          if (sync === "clear" || (sync === "set" && !hasDock && !list.length)) {
            const clearId =
              (payload && !Array.isArray(payload) && payload.todoId && String(payload.todoId).trim()) ||
              (dockState && dockState.id && String(dockState.id).trim()) ||
              "";
            if (clearId && !replace) {
              const el = findDock(clearId);
              if (el) el.remove();
            } else {
              allDocks().forEach((el) => el.remove());
            }
            relayoutTodoDocks();
            return;
          }

          if (sync === "set" && replace) {
            // Drop sibling docks so we never stack duplicates.
            for (const el of allDocks()) {
              const key = el.getAttribute("data-wg-todo-key") || "_default";
              if (key !== dockKey) el.remove();
            }
          }

          const POS = ["left", "right"];
          let dock = findDock(dockKey);
          if (!dock) {
            dock = document.createElement("div");
            dock.className = "wg-todo-dock";
            dock.setAttribute("data-wg-todo-key", dockKey);
            if (dockKey === "_default") dock.id = "wg-todo-dock";
            else dock.id = "wg-todo-dock--" + dockKey.replace(/[^a-zA-Z0-9_-]/g, "-");
            dock.setAttribute("data-wg-ui", "1");
            dock.setAttribute("data-wg-modal", "todos");
            dock.setAttribute("data-wg-ready", "1");
            let saved = null;
            try {
              saved = localStorage.getItem("wg-todo-pos");
            } catch {
              /* ignore */
            }
            const start =
              wantPos ||
              (saved && POS.includes(saved) ? saved : todoPos === "right" ? "right" : "left");
            dock.dataset.pos = start;
            dock.title = "Click to move checklist: left / right";
            dock.addEventListener("click", (e) => {
              e.stopPropagation();
              const i = POS.indexOf(dock.dataset.pos || "left");
              const next = POS[(i + 1) % POS.length];
              dock.dataset.pos = next;
              try {
                localStorage.setItem("wg-todo-pos", next);
              } catch {
                /* ignore */
              }
            });
            document.documentElement.appendChild(dock);
          } else if (wantPos) {
            dock.dataset.pos = wantPos;
            try {
              localStorage.setItem("wg-todo-pos", wantPos);
            } catch {
              /* ignore */
            }
          }

          const esc = (s) =>
            String(s)
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;");
          const attrId = (raw) => {
            const id = raw != null && String(raw).trim() ? String(raw).trim() : "";
            return id ? ' data-wg-todo-item="' + esc(id) + '"' : "";
          };
          // Compact + cap: >cap rows folds overflow; hover shows up to expandCap; "+N more" pins expand.
          const ui = (payload && !Array.isArray(payload) && payload.ui) || window.__wgTodoDockUi || {};
          const COMPACT_AT = Number(ui.cap) > 0 ? Number(ui.cap) : 5;
          const WINDOW = COMPACT_AT;
          const EXPAND_MAX = Number(ui.expandCap) > 0 ? Number(ui.expandCap) : 14;
          const compactEnabled = ui.compact !== false;
          const flattenItems = () => {
            if (dockState && Array.isArray(dockState.groups) && dockState.groups.length) {
              const out = [];
              for (const g of dockState.groups) {
                for (const t of g.items || []) out.push({ ...t, __style: g.style || dockState.style });
              }
              return out;
            }
            return (list || []).map((t) => ({ ...t, __style: "sequential" }));
          };
          const windowBounds = (items, cap) => {
            const n = items.length;
            if (n <= cap) return { start: 0, end: n };
            let cur = items.findIndex((t) => t.current);
            if (cur < 0) cur = items.findIndex((t) => !t.done);
            if (cur < 0) cur = 0;
            let start = Math.max(0, cur - Math.floor((cap - 1) / 2));
            let end = Math.min(n, start + cap);
            start = Math.max(0, end - cap);
            return { start, end };
          };
          const renderItems = (items, style, foldMeta, indexOffset) => {
            const offset = indexOffset || 0;
            const rawStyle = String(style || "sequential").toLowerCase();
            const st =
              rawStyle === "checklist"
                ? "checklist"
                : rawStyle === "bullets" ||
                    rawStyle === "bullet" ||
                    rawStyle === "list" ||
                    rawStyle === "ul" ||
                    rawStyle === "points" ||
                    rawStyle === "plain"
                  ? "bullets"
                  : "sequential";
            const foldStart = foldMeta ? foldMeta.foldStart : -1;
            const foldEnd = foldMeta ? foldMeta.foldEnd : -1;
            const deepStart = foldMeta ? foldMeta.deepStart : -1;
            const deepEnd = foldMeta ? foldMeta.deepEnd : -1;
            return (
              '<ul class="wg-todos-list" data-wg-todo-style="' +
              st +
              '">' +
              (items || [])
                .map((t, idx) => {
                  const gi = offset + idx;
                  const clsBase =
                    st === "bullets"
                      ? t.done
                        ? "wg-todo-done"
                        : "wg-todo-pending"
                      : t.current
                        ? "wg-todo-current"
                        : t.done
                          ? "wg-todo-done"
                          : "wg-todo-pending";
                  let foldCls = "";
                  if (foldStart >= 0 && (gi < foldStart || gi >= foldEnd)) foldCls += " wg-todo-fold";
                  if (deepStart >= 0 && (gi < deepStart || gi >= deepEnd)) foldCls += " wg-todo-fold-deep";
                  let mark;
                  if (st === "checklist") {
                    mark = t.done ? "☑" : "☐";
                  } else if (st === "bullets") {
                    mark = "•";
                  } else {
                    mark = t.done ? "✓" : t.current ? "→" : "○";
                  }
                  const rowId = t.id || t.name || "";
                  return (
                    '<li class="' +
                    clsBase +
                    foldCls +
                    '"' +
                    attrId(rowId) +
                    '><span class="wg-todo-mark">' +
                    mark +
                    "</span><span>" +
                    esc(t.text || "") +
                    "</span></li>"
                  );
                })
                .join("") +
              "</ul>"
            );
          };

          if (dockKey !== "_default") dock.setAttribute("data-wg-todo-id", dockKey);
          else dock.removeAttribute("data-wg-todo-id");

          const flat = flattenItems();
          const compact = compactEnabled && flat.length > COMPACT_AT;
          const win = windowBounds(flat, WINDOW);
          const expand = windowBounds(flat, EXPAND_MAX);
          const foldMeta = compact
            ? {
                foldStart: win.start,
                foldEnd: win.end,
                deepStart: expand.start,
                deepEnd: expand.end,
              }
            : null;
          const hiddenCompact = compact ? flat.length - (win.end - win.start) : 0;
          const hiddenExpand = compact ? flat.length - (expand.end - expand.start) : 0;

          let html = "";
          if (dockState && Array.isArray(dockState.groups) && dockState.groups.length) {
            const dockTitle = dockState.title && String(dockState.title).trim();
            if (dockTitle) {
              html += '<div class="wg-todo-dock-title">' + esc(dockTitle) + "</div>";
            }
            let globalIdx = 0;
            for (const g of dockState.groups) {
              const gTitle = g.title && String(g.title).trim();
              const gid = g.id || g.name || "";
              html +=
                '<div class="wg-todo-group"' +
                (gid ? ' data-wg-todo-group="' + esc(gid) + '"' : "") +
                ">";
              if (gTitle) {
                html += '<div class="wg-todo-group-title">' + esc(gTitle) + "</div>";
              }
              const gItems = g.items || [];
              html += renderItems(gItems, g.style || dockState.style, foldMeta, globalIdx);
              html += "</div>";
              globalIdx += gItems.length;
            }
          } else {
            html = renderItems(list, "sequential", foldMeta, 0);
          }
          if (compact && hiddenCompact > 0) {
            const n = dock.dataset.expanded === "1" ? hiddenExpand : hiddenCompact;
            if (n > 0) {
              html +=
                '<div class="wg-todo-more" data-wg-todo-more="1" title="Click to expand / collapse">' +
                "+" +
                n +
                " more</div>";
            }
          }
          if (compact) dock.dataset.compact = "1";
          else {
            delete dock.dataset.compact;
            delete dock.dataset.expanded;
          }
          dock.innerHTML = html;
          const moreBtn = dock.querySelector("[data-wg-todo-more]");
          if (moreBtn) {
            moreBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (dock.dataset.expanded === "1") delete dock.dataset.expanded;
              else dock.dataset.expanded = "1";
              if (window.__wgSyncTodos && dock._wgLastPayload) {
                window.__wgSyncTodos(dock._wgLastPayload);
              }
            });
          }
          dock._wgLastPayload = syncPayload;
          relayoutTodoDocks();
          if (window.__wgStampModal) {
            window.__wgStampModal(dock, "todos", { ready: true });
          }
        };
        // Device toast + chip (0.13.2+) - announce on set/clear; quiet chip on keep.
        // Payload: { sync, device?, remain?, announce? }
        window.__wgSyncDevice = (payload) => {
          const sync =
            payload && (payload.sync === "clear" || payload.sync === "keep" || payload.sync === "set")
              ? payload.sync
              : "keep";
          const device = payload && payload.device ? payload.device : null;
          const cursor = document.getElementById("wg-cursor");
          const MOUSE_SVG =
            "<svg viewBox='0 0 32 32' width='24' height='24'>" +
            "<path fill='#0C0C1A' stroke='#fff' stroke-width='1.4' stroke-linejoin='round' " +
            "d='M6 3.5l1.4 22.5 5.8-5.4 4.2 9.4 3.6-1.6-4.2-9.2H26z'/></svg>";
          const FINGER_SVG =
            "<svg viewBox='0 0 32 32' width='28' height='28'>" +
            "<ellipse cx='16' cy='22' rx='7' ry='8' fill='#0C0C1A' stroke='#fff' stroke-width='1.4'/>" +
            "<rect x='12' y='6' width='8' height='16' rx='4' fill='#0C0C1A' stroke='#fff' stroke-width='1.4'/>" +
            "</svg>";
          const ICONS = {
            mobile:
              '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/>' +
              '<circle cx="12" cy="18.2" r="1.1" fill="#fff" stroke="none"/></svg>',
            tablet:
              '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="3.5" y="4" width="17" height="16" rx="2"/>' +
              '<circle cx="12" cy="17.2" r="1" fill="#fff" stroke="none"/></svg>',
            desktop:
              '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="2.5" y="3.5" width="19" height="12.5" rx="1.5"/>' +
              '<path d="M8 20h8M12 16v4"/></svg>',
          };
          const setCursor = (touch) => {
            if (!cursor) return;
            if (touch) {
              cursor.setAttribute("data-touch", "1");
              cursor.innerHTML = FINGER_SVG;
            } else {
              cursor.removeAttribute("data-touch");
              cursor.innerHTML = MOUSE_SVG;
            }
          };
          const ensureChip = (preset, touch, remain, orientation) => {
            let badge = document.getElementById("wg-device-badge");
            if (preset === "desktop" && !touch) {
              if (badge) {
                badge.classList.remove("wg-in");
                setTimeout(() => {
                  const b = document.getElementById("wg-device-badge");
                  if (b) b.remove();
                }, 320);
              }
              return;
            }
            if (!badge) {
              badge = document.createElement("div");
              badge.id = "wg-device-badge";
              badge.setAttribute("data-wg-ui", "1");
              document.documentElement.appendChild(badge);
            }
            badge.dataset.preset = preset;
            badge.dataset.touch = touch ? "1" : "0";
            const orient =
              orientation === "landscape" || orientation === "portrait"
                ? orientation
                : "";
            if (orient) badge.dataset.orientation = orient;
            const chipLabel =
              preset === "desktop" && !touch
                ? "desktop"
                : preset +
                  (orient ? " · " + (orient === "landscape" ? "land" : "port") : "") +
                  (remain ? " · remain" : "");
            badge.innerHTML =
              '<span class="wg-dev-icon">' +
              (ICONS[preset] || ICONS.desktop) +
              '</span><span class="wg-dev-label">' +
              chipLabel +
              "</span>";
            void badge.offsetWidth;
            badge.classList.add("wg-in");
          };
          const showToast = (preset, touch, title, sub, orientation) => {
            let toast = document.getElementById("wg-device-toast");
            if (toast && toast._wgTimer) {
              clearTimeout(toast._wgTimer);
              toast._wgTimer = null;
            }
            if (!toast) {
              toast = document.createElement("div");
              toast.id = "wg-device-toast";
              toast.setAttribute("data-wg-ui", "1");
              document.documentElement.appendChild(toast);
            }
            // Hide chip while toast is up (same corner).
            const badge = document.getElementById("wg-device-badge");
            if (badge) badge.classList.remove("wg-in");
            toast.dataset.preset = preset;
            toast.innerHTML =
              '<span class="wg-dev-icon">' +
              (ICONS[preset] || ICONS.desktop) +
              '</span><span class="wg-dev-copy"><div class="wg-dev-title">' +
              title +
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
                const t = document.getElementById("wg-device-toast");
                if (t) t.remove();
                if (preset !== "desktop" || touch) {
                  ensureChip(preset, touch, true, orientation);
                }
              }, 380);
            }, 2200);
          };

          if (sync === "keep" && !device) return;

          const isDesktopClear =
            sync === "clear" ||
            (device && device.preset === "desktop" && !device.touchMode);
          if (isDesktopClear) {
            setCursor(false);
            const announce = payload.announce !== false && sync !== "keep";
            if (announce) {
              const vp = device && device.viewport ? device.viewport : { width: 1280, height: 720 };
              showToast(
                "desktop",
                false,
                "Back to desktop",
                vp.width + "×" + vp.height + " · mouse",
                "landscape",
              );
              setTimeout(() => {
                const badge = document.getElementById("wg-device-badge");
                if (badge) badge.remove();
              }, 2600);
            } else {
              const badge = document.getElementById("wg-device-badge");
              if (badge) badge.remove();
              const toast = document.getElementById("wg-device-toast");
              if (toast) toast.remove();
            }
            window.__wgDevicePreset = "desktop";
            window.__wgDeviceOrientation = "landscape";
            window.__wgDeviceTouch = false;
            document.documentElement.dataset.wgTouch = "0";
            if (window.__wgEnsureZoomBadge) window.__wgEnsureZoomBadge();
            return;
          }

          if (!device) return;
          const preset = device.preset || "desktop";
          const touch = !!device.touchMode;
          const remain = payload.remain !== false && sync !== "clear";
          const vp = device.viewport || {};
          const orient =
            device.orientation === "landscape" || device.orientation === "portrait"
              ? device.orientation
              : vp.height > vp.width
                ? "portrait"
                : "landscape";
          const prev = window.__wgDevicePreset || "";
          const prevOrient = window.__wgDeviceOrientation || "";
          const presetChanged = prev !== preset || (touch && prev === "desktop");
          const orientChanged = prevOrient !== "" && prevOrient !== orient;
          const changed = presetChanged || orientChanged || prev === "";
          setCursor(touch);
          window.__wgDevicePreset = preset;
          window.__wgDeviceOrientation = orient;
          window.__wgDeviceTouch = touch;
          document.documentElement.dataset.wgTouch = touch ? "1" : "0";
          if (window.__wgEnsureZoomBadge) window.__wgEnsureZoomBadge();

          const announce =
            payload.announce === true ||
            (payload.announce !== false && (sync === "set" || sync === "clear") && changed);

          const size =
            (vp.width || "?") +
            "×" +
            (vp.height || "?") +
            " · " +
            orient +
            (touch ? " · touch" : "");
          let titleText = {
            mobile: "Now in mobile mode",
            tablet: "Now in tablet mode",
            desktop: "Now in desktop mode",
          }[preset] || "Device updated";
          if (orientChanged && !presetChanged) {
            titleText =
              orient === "landscape" ? "Rotated to landscape" : "Rotated to portrait";
          }
          if (announce) {
            showToast(preset, touch, titleText, size, orient);
          } else {
            ensureChip(preset, touch, remain, orient);
          }
        };
      },
      { title, favicon: WAYGRAPH_FAVICON, bannerPos, todoPos, envAutoplay, todoDockUi },
    )
    .catch(() => {});
  // Navigations wipe #wg-device-shell - rebuild when video stage + device are live.
  // If we already shuttered to desktop-flat, re-apply FLAT (never re-add bezel).
  if (
    page.__wgVideoViewport &&
    page.__wgDeviceShell &&
    page.__wgDeviceShell.width &&
    page.__wgDeviceShell.height
  ) {
    await applyVideoDeviceStage(page, page.__wgDeviceShell, page.__wgVideoViewport, {
      clear: false,
      shutterOut: !!page.__wgDesktopFlat,
      desktopFlat: !!page.__wgDesktopFlat,
    });
  }
}
