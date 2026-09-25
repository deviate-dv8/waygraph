// In-page installer (runs inside the browser via page.evaluate): must stay self-contained - no module-scope closure.
// Split out of the former single installOverlay evaluate (see src/ARCHITECTURE.md). Shares state only via window.__wg*.
/* eslint-disable no-unused-vars */
export function installBanner({ title, favicon, bannerPos, todoPos, envAutoplay, todoDockUi }) {
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
}
