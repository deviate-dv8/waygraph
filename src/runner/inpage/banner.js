// In-page installer (runs inside the browser via page.evaluate): must stay self-contained - no module-scope closure.
// Split out of the former single installOverlay evaluate (see src/ARCHITECTURE.md). Shares state only via window.__wg*.
/* eslint-disable no-unused-vars */
export function installBanner({ title, favicon, bannerPos, todoPos, envAutoplay, todoDockUi, bannerUi }) {
        const POSITIONS = ["left", "center", "right"];
        const applyPos = (el, pos) => {
          el.dataset.pos = pos;
          el.dataset.home = pos;
          try {
            localStorage.setItem("wg-banner-pos", pos);
          } catch {
            /* private mode / blocked storage - position still applies this page */
          }
        };
        if (title) {
          let banner = __wgById("wg-banner");
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
            __wgAdd(banner);
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
        // Authored banner UX (StubCtx.titlePos / bannerUi): applied every step, wins over click/env.
        if (bannerUi) {
          const cur = window.__wgBannerUi || {};
          window.__wgBannerUi = { ...cur, ...bannerUi };
        }
        const bui = window.__wgBannerUi || {};
        const bannerEl = __wgById("wg-banner");
        if (bannerEl) {
          if (bui.pos && POSITIONS.includes(bui.pos) && bannerEl.dataset.home !== bui.pos) {
            bannerEl.dataset.pos = bui.pos;
            bannerEl.dataset.home = bui.pos;
            bannerEl.dataset.authored = "1";
          }
          bannerEl.dataset.collision = bui.collision === false ? "0" : "1";
          bannerEl.style.display = bui.hidden ? "none" : "";
        }
        // Move the banner out of the way of a highlight ring (mirrors the todo dock's collision flip).
        window.__wgBannerAvoidRing = (box) => {
          const b = __wgById("wg-banner");
          if (!b || !box || b.dataset.collision === "0" || b.style.display === "none") return;
          const pad = 10;
          const hits = () => {
            const r = b.getBoundingClientRect();
            return !(
              r.right < box.x - pad ||
              r.left > box.x + box.width + pad ||
              r.bottom < box.y - pad ||
              r.top > box.y + box.height + pad
            );
          };
          const home = b.dataset.home || b.dataset.pos || "left";
          b.dataset.pos = home;
          if (!hits()) {
            delete b.dataset.moved;
            return;
          }
          for (const cand of POSITIONS.filter((p) => p !== home)) {
            b.dataset.pos = cand;
            if (!hits()) {
              b.dataset.moved = home + ">" + cand;
              (window.__wgBannerLog = window.__wgBannerLog || []).push("moved " + home + " -> " + cand + " (ring overlap)");
              return;
            }
          }
          b.dataset.pos = home;
          b.dataset.moved = "none-free";
          (window.__wgBannerLog = window.__wgBannerLog || []).push("overlap at every position (kept " + home + ")");
        };
        window.__wgBannerRestore = () => {
          const b = __wgById("wg-banner");
          if (!b) return;
          if (b.dataset.home) b.dataset.pos = b.dataset.home;
          delete b.dataset.moved;
        };
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
}
