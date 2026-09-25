// In-page installer (runs inside the browser via page.evaluate): must stay self-contained - no module-scope closure.
// Split out of the former single installOverlay evaluate (see src/ARCHITECTURE.md). Shares state only via window.__wg*.
/* eslint-disable no-unused-vars */
export function installStamp({ title, favicon, bannerPos, todoPos, envAutoplay, todoDockUi }) {
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
}
