// In-page installer (runs inside the browser via page.evaluate): must stay self-contained - no module-scope closure.
// Split out of the former single installOverlay evaluate (see src/ARCHITECTURE.md). Shares state only via window.__wg*.
/* eslint-disable no-unused-vars */
export function installDevice({ title, favicon, bannerPos, todoPos, envAutoplay, todoDockUi }) {
        // Device toast + chip (0.13.2+) - announce on set/clear; quiet chip on keep.
        // Payload: { sync, device?, remain?, announce? }
        window.__wgSyncDevice = (payload) => {
          const sync =
            payload && (payload.sync === "clear" || payload.sync === "keep" || payload.sync === "set")
              ? payload.sync
              : "keep";
          const device = payload && payload.device ? payload.device : null;
          const cursor = __wgById("wg-cursor");
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
            let badge = __wgById("wg-device-badge");
            if (preset === "desktop" && !touch) {
              if (badge) {
                badge.classList.remove("wg-in");
                setTimeout(() => {
                  const b = __wgById("wg-device-badge");
                  if (b) b.remove();
                }, 320);
              }
              return;
            }
            if (!badge) {
              badge = document.createElement("div");
              badge.id = "wg-device-badge";
              badge.setAttribute("data-wg-ui", "1");
              __wgAdd(badge);
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
            let toast = __wgById("wg-device-toast");
            if (toast && toast._wgTimer) {
              clearTimeout(toast._wgTimer);
              toast._wgTimer = null;
            }
            if (!toast) {
              toast = document.createElement("div");
              toast.id = "wg-device-toast";
              toast.setAttribute("data-wg-ui", "1");
              __wgAdd(toast);
            }
            // Hide chip while toast is up (same corner).
            const badge = __wgById("wg-device-badge");
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
                const t = __wgById("wg-device-toast");
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
                const badge = __wgById("wg-device-badge");
                if (badge) badge.remove();
              }, 2600);
            } else {
              const badge = __wgById("wg-device-badge");
              if (badge) badge.remove();
              const toast = __wgById("wg-device-toast");
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
}
