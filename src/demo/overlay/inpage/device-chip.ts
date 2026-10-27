// In-page (runs inside the browser via page.evaluate, must stay self-contained): the device toast and chip.
export function installDevice() {
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
          // A touch: the Simulator's translucent fingertip.
          const FINGER_SVG =
            "<svg viewBox='0 0 32 32' width='28' height='28'>" +
            "<circle cx='16' cy='16' r='11' fill='rgba(255,255,255,.6)' stroke='rgba(0,0,0,.35)' stroke-width='1'/></svg>";
          const iconOf = (preset: string) => (preset === "mobile" ? "mobile" : preset === "tablet" ? "tablet" : "desktop");
          const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
          const setCursor = (touch: boolean) => {
            if (!cursor) return;
            if (touch) {
              cursor.setAttribute("data-touch", "1");
              __wgSet(cursor, __wgSvg(FINGER_SVG));
            } else {
              cursor.removeAttribute("data-touch");
              __wgSet(cursor, __wgSvg(MOUSE_SVG));
            }
          };
          const ensureChip = (preset: string, touch: boolean, remain: boolean, orientation: string) => {
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
              badge = __wgEl("div", {
                id: "wg-device-badge",
                class: "capsule material h-7 px-2.5 text-sm font-medium pointer-events-none overflow-hidden",
                attrs: { "data-wg-ui": "1" },
              });
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
                ? "Desktop"
                : cap(preset) + (orient ? " · " + cap(orient) : "") + (remain ? " · stays" : "");
            __wgSet(
              badge,
              __wgIcon(iconOf(preset), "text-label-2"),
              __wgEl("span", { class: "wg-dev-label truncate min-w-0" }, chipLabel),
            );
            void badge.offsetWidth;
            badge.classList.add("wg-in");
          };
          const showToast = (preset: string, touch: boolean, title: string, sub: string, orientation: string) => {
            let toast = __wgById("wg-device-toast");
            if (toast && toast._wgTimer) {
              clearTimeout(toast._wgTimer);
              toast._wgTimer = undefined;
            }
            if (!toast) {
              toast = __wgEl("div", {
                id: "wg-device-toast",
                class: "material rounded-panel flex items-center gap-3 p-2.5 pr-4 w-[min(92vw,300px)] pointer-events-none",
                attrs: { "data-wg-ui": "1" },
              });
              __wgAdd(toast);
            }
            // Hide chip while toast is up (same corner).
            const badge = __wgById("wg-device-badge");
            if (badge) badge.classList.remove("wg-in");
            toast.dataset.preset = preset;
            __wgSet(
              toast,
              __wgEl("span", { class: "grid place-items-center size-9 flex-none rounded-card bg-fill text-[20px] text-accent" }, __wgIcon(iconOf(preset))),
              __wgEl(
                "span",
                { class: "flex flex-col min-w-0" },
                __wgEl("span", { class: "text-base font-semibold" }, title),
                __wgEl("span", { class: "text-sm text-label-2 truncate" }, sub),
              ),
            );
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
            const announce = payload?.announce !== false && sync !== "keep";
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
          const remain = payload?.remain !== false;
          const vp = device.viewport || { width: 0, height: 0 };
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
            payload?.announce === true ||
            (payload?.announce !== false && sync === "set" && changed);

          const size =
            (vp.width || "?") +
            "×" +
            (vp.height || "?") +
            " · " +
            orient +
            (touch ? " · touch" : "");
          const titles: Record<string, string> = {
            mobile: "Now in mobile mode",
            tablet: "Now in tablet mode",
            desktop: "Now in desktop mode",
          };
          let titleText = titles[preset] || "Device updated";
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
