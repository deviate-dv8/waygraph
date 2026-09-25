// In-page installer (runs inside the browser via page.evaluate): must stay self-contained - no module-scope closure.
// Split out of the former single installOverlay evaluate (see src/ARCHITECTURE.md). Shares state only via window.__wg*.
/* eslint-disable no-unused-vars */
export function installCore({ title, favicon, bannerPos, todoPos, envAutoplay, todoDockUi }) {
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
        if (!__wgById("wg-ring")) {
          const ring = document.createElement("div");
          ring.id = "wg-ring";
          __wgAdd(ring);
        }
        if (!__wgById("wg-ring-label")) {
          const ringLabel = document.createElement("div");
          ringLabel.id = "wg-ring-label";
          __wgAdd(ringLabel);
        }
        if (!__wgById("wg-cursor")) {
          const cursor = document.createElement("div");
          cursor.id = "wg-cursor";
          // Dark fill + white stroke, same as help-center-clip-engine's own
          // #clip-cursor - visible against any page background, light or
          // dark, unlike a plain solid-white shape.
          cursor.innerHTML =
            "<svg viewBox='0 0 32 32' width='24' height='24'>" +
            "<path fill='#0C0C1A' stroke='#fff' stroke-width='1.4' stroke-linejoin='round' " +
            "d='M6 3.5l1.4 22.5 5.8-5.4 4.2 9.4 3.6-1.6-4.2-9.2H26z'/></svg>";
          __wgAdd(cursor);
        }
        if (!__wgById("wg-click-pulse")) {
          const pulse = document.createElement("div");
          pulse.id = "wg-click-pulse";
          __wgAdd(pulse);
        }
        window.__wgMoveCursorTo = (x, y, ms, instant) => {
          const cursor = __wgById("wg-cursor");
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
          const cursor = __wgById("wg-cursor");
          if (cursor) cursor.style.opacity = "0";
        };
        window.__wgPositionRing = (box, label, tone, style) => {
          const ring = __wgById("wg-ring");
          const ringLabel = __wgById("wg-ring-label");
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
            __wgQA(".wg-todo-dock, #wg-todo-dock").forEach((el) => {
              el.classList.remove("wg-todo-behind");
            });
            return;
          }
          __wgQA(".wg-todo-dock, #wg-todo-dock").forEach((el) => {
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
          const docks = [...__wgQA(".wg-todo-dock, #wg-todo-dock")].filter(
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
          const pulse = __wgById("wg-click-pulse");
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
          const ring = __wgById("wg-ring");
          const ringLabel = __wgById("wg-ring-label");
          if (ring) ring.style.opacity = "0";
          if (ringLabel) ringLabel.style.opacity = "0";
          if (window.__wgClearFocus) window.__wgClearFocus();
          if (window.__wgTodosSetBehind) window.__wgTodosSetBehind(false);
          window.__wgTodoCollisionLocked = false;
          __wgQA(".wg-todo-dock[data-tucked], #wg-todo-dock[data-tucked]").forEach((el) => {
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
          const veil = __wgById("wg-focus-veil");
          if (!veil) return;
          veil.classList.remove("wg-in");
          setTimeout(() => {
            const v = __wgById("wg-focus-veil");
            if (v && !v.classList.contains("wg-in")) v.remove();
          }, 320);
        };
        window.__wgApplyFocus = (box) => {
          if (!box) {
            if (window.__wgClearFocus) window.__wgClearFocus();
            return;
          }
          let veil = __wgById("wg-focus-veil");
          if (!veil) {
            veil = document.createElement("div");
            veil.id = "wg-focus-veil";
            veil.setAttribute("data-wg-ui", "1");
            __wgAdd(veil);
          }
          const pad = 10;
          veil.style.left = Math.max(0, box.x - pad) + "px";
          veil.style.top = Math.max(0, box.y - pad) + "px";
          veil.style.width = Math.max(8, box.width + pad * 2) + "px";
          veil.style.height = Math.max(8, box.height + pad * 2) + "px";
          void veil.offsetWidth;
          veil.classList.add("wg-in");
        };
}
