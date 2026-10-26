// In-page (runs inside the browser via page.evaluate, must stay self-contained): the ring, cursor and click pulse every surface paints with.
import type { OverlayInstallArgs, WgBox } from "../../types.js";
export function installCore({ envAutoplay, todoDockUi }: OverlayInstallArgs) {
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
        // The one shared ring primitive (ui/css/ring.css) - #wg-ring/#wg-ring-label is just this
        // surface's OWN ring instance, found by id like any other (see __wgEnsureRingEl below).
        window.__wgEnsureRingEl = (ringId: string, labelId: string) => {
          let ring = __wgById(ringId);
          if (!ring) {
            ring = document.createElement("div");
            ring.id = ringId;
            ring.className = "wg-ring-el";
            __wgAdd(ring);
          }
          let label = __wgById(labelId);
          if (!label) {
            label = document.createElement("div");
            label.id = labelId;
            label.className = "wg-ring-el-label";
            __wgAdd(label);
          }
          return [ring, label];
        };
        /** Bare positioning only - no collision/follow/focus-veil (those are #wg-ring's own extras, see __wgPositionRing). */
        window.__wgPaintRingAt = (ringId, labelId, box, label, tone, style) => {
          const [ring, ringLabel] = window.__wgEnsureRingEl(ringId, labelId);
          if (!box) return null;
          const raw = (tone || "planned") + "";
          const t =
            raw === "auto" || raw === "info" || raw === "warning" || raw === "danger" || raw === "success" || raw === "orange"
              ? raw
              : "planned";
          const st = style && typeof style === "object" ? style : {};
          const sizeRaw = (st.size || "md") + "";
          const size = sizeRaw === "sm" || sizeRaw === "lg" ? sizeRaw : "md";
          const weightRaw = (st.weight || "normal") + "";
          const weight = weightRaw === "bold" ? "bold" : "normal";
          ring.dataset.tone = t;
          ringLabel.dataset.tone = t;
          ring.dataset.size = size;
          ringLabel.dataset.size = size;
          ringLabel.dataset.weight = weight;
          if (st.color) ringLabel.style.color = st.color;
          else ringLabel.style.removeProperty("color");
          const pad = size === "sm" ? 3 : size === "lg" ? 10 : 6;
          const margin = 6;
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const left = box.x - pad;
          const top = box.y - pad;
          const width = Math.max(4, box.width + pad * 2);
          const height = Math.max(4, box.height + pad * 2);
          ring.style.left = left + "px";
          ring.style.top = top + "px";
          ring.style.width = width + "px";
          ring.style.height = height + "px";
          ring.style.opacity = "1";
          if (labelId === "wg-ring-label") {
            // The demo ring's caption is drawn from data-label (CSS ::after), not DOM text, so the page's own
            // text selectors (getByText, text=...) never match waygraph's overlay twice.
            ringLabel.dataset.label = label || "";
            ringLabel.textContent = "";
          } else {
            ringLabel.textContent = label || "";
          }
          ringLabel.style.opacity = "1";
          const lw = ringLabel.offsetWidth;
          const lh = ringLabel.offsetHeight;
          let labelLeft = left;
          let labelTop = top + height + 8;
          const aboveTop = top - lh - 8;
          if (labelTop + lh > vh - margin) {
            labelTop = aboveTop;
          } else {
            // Below the ringed box is often the NEXT form field in a tightly stacked list (e.g.
            // saucedemo's checkout "First Name" / "Last Name" / "Zip" inputs) - a fixed +8px gap
            // has no idea that's there and the label just sits on top of it. Sample a few points
            // under the would-be label and flip above if any land on real page content (not our
            // own ring/label elements, which are the only things expected there otherwise).
            const probe = (x: number, y: number) => {
              const el = document.elementFromPoint(x, y);
              return el && el.id !== ringId && el.id !== labelId && !(el.closest && el.closest("#wg-root"));
            };
            const hitsPageContent =
              probe(labelLeft + 2, labelTop + 2) ||
              probe(labelLeft + lw - 2, labelTop + 2) ||
              probe(labelLeft + 2, labelTop + lh - 2);
            if (hitsPageContent && aboveTop >= margin) labelTop = aboveTop;
          }
          if (labelTop < margin) labelTop = margin;
          if (labelLeft + lw > vw - margin) labelLeft = Math.max(margin, vw - margin - lw);
          if (labelLeft < margin) labelLeft = margin;
          ringLabel.style.left = labelLeft + "px";
          ringLabel.style.top = labelTop + "px";
          return [ring, ringLabel];
        };
        window.__wgEnsureRingEl("wg-ring", "wg-ring-label");
        if (!__wgById("wg-cursor")) {
          const cursor = document.createElement("div");
          cursor.id = "wg-cursor";
          // Dark fill + white stroke, same as help-center-clip-engine's own
          // #clip-cursor - visible against any page background, light or
          // dark, unlike a plain solid-white shape.
          cursor.append(
            __wgSvg(
              "<svg viewBox='0 0 32 32' width='24' height='24'>" +
                "<path fill='#0C0C1A' stroke='#fff' stroke-width='1.4' stroke-linejoin='round' " +
                "d='M6 3.5l1.4 22.5 5.8-5.4 4.2 9.4 3.6-1.6-4.2-9.2H26z'/></svg>",
            ),
          );
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
        // #wg-ring's own extras on top of the shared __wgPaintRingAt primitive: todo/banner
        // collision avoidance only makes sense for the ONE "current action" ring, not Pilot's
        // several independent fixture rings - kept here, not pushed down into the shared painter.
        window.__wgPositionRing = (box, label, tone, style) => {
          if (!box) return;
          window.__wgPaintRingAt!("wg-ring", "wg-ring-label", box, label, tone, style);
          if (window.__wgTodosSetBehind) window.__wgTodosSetBehind(true);
          if (window.__wgBannerSetBehind) window.__wgBannerSetBehind(true);
          if (window.__wgTodosAvoidRingCollision) window.__wgTodosAvoidRingCollision(box);
          if (window.__wgBannerAvoidRing) window.__wgBannerAvoidRing(box);
        };
        /** Dim/lower floating todo docks while a ring caption is the focus. */
        window.__wgTodosSetBehind = (on: boolean) => {
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
        window.__wgTodosAvoidRingCollision = (box: WgBox) => {
          const ui = window.__wgTodoDockUi || {};
          if (ui.collision === false) return;
          if (!box || window.__wgTodoCollisionLocked) return;
          const pad = 10;
          const rx1 = box.x - pad;
          const ry1 = box.y - pad;
          const rx2 = box.x + box.width + pad;
          const ry2 = box.y + box.height + pad;
          const overlaps = (el: HTMLElement) => {
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
        /** Live-follow a resolved element with rAF (accurate under device shell scale). */
        window.__wgStopRingFollow = () => {
          if (window.__wgRingFollowRaf) {
            cancelAnimationFrame(window.__wgRingFollowRaf);
            window.__wgRingFollowRaf = 0;
          }
          window.__wgRingFollowEl = null;
        };
        // `el` is a real DOM element (a Playwright ElementHandle unwrapped by evaluate() - see
        // rings.js's showRing), not a selector string - >> piercing / :has-text() are Playwright's
        // own selector-engine syntax, which document.querySelector has no way to understand, so
        // resolution happens once on the Node side via page.locator(), before this ever runs.
        window.__wgFollowRing = (el: HTMLElement, label: string, tone?: string, style?: WgRingStyle, focus?: boolean) => {
          window.__wgStopRingFollow();
          if (!el) return;
          window.__wgRingFollowEl = el;
          const tick = () => {
            if (window.__wgRingFollowEl !== el) return;
            if (!el.isConnected) {
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
          if (window.__wgStopRingFollow) window.__wgStopRingFollow();
          const ring = __wgById("wg-ring");
          const ringLabel = __wgById("wg-ring-label");
          if (ring) ring.style.opacity = "0";
          if (ringLabel) ringLabel.style.opacity = "0";
          if (window.__wgClearFocus) window.__wgClearFocus();
          if (window.__wgTodosSetBehind) window.__wgTodosSetBehind(false);
          if (window.__wgBannerSetBehind) window.__wgBannerSetBehind(false);
          if (window.__wgBannerRestore) window.__wgBannerRestore();
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
        window.__wgApplyFocus = (box: WgBox) => {
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
