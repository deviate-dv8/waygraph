// In-page (runs inside the browser via page.evaluate, must stay self-contained): the step panel - the parts every panel
// shares (its frame, heading, footer) and its title bar (Hide / Show, the collapsed Next).
export function installPanelChrome() {
        // The one #wg-panel, reused across steps (replacing it every step flashed).
        window.__wgPanel = () => {
          const found = __wgById("wg-panel");
          if (found) return { panel: found, isNew: false };
          const panel = __wgEl("div", {
            id: "wg-panel",
            class: "material-thick rounded-panel w-[min(92vw,600px)] overflow-y-auto px-4 pt-2 pb-3.5 text-base",
          });
          return { panel, isNew: true };
        };
        // Progress, episodes (a segmented control), pace and the step chips, in that order. `current` is the step being
        // shown (none after it ran); steps before `doneBefore` read as done.
        window.__wgPanelFrame = (info, opts) => {
          const progress =
            opts.progress == null
              ? null
              : __wgEl(
                  "div",
                  { id: "wg-progress", class: "h-[3px] rounded-full bg-fill-2 overflow-hidden mt-1 mb-3" },
                  __wgEl("div", {
                    id: "wg-progress-bar",
                    class: "h-full rounded-full bg-accent transition-[width] duration-300",
                    style: "width:" + opts.progress + "%",
                  }),
                );
          const episodes =
            info.allEpisodes && info.allEpisodes.length > 0
              ? __wgEl(
                  "div",
                  { id: "wg-episodes", class: "segmented max-w-full overflow-x-auto mb-2.5" },
                  info.allEpisodes.map((e) => {
                    const state =
                      e.episodeNumber < (info.episodeNumber ?? 0) ? "done" : e.episodeNumber === info.episodeNumber ? "current" : "upcoming";
                    const look =
                      state === "current" ? "bg-control shadow-control text-label" : state === "done" ? "text-label-2" : "text-label-3";
                    const entered = opts.entered && state === "current" ? " wg-ep-entered" : "";
                    return __wgEl(
                      "span",
                      { class: `wg-ep-tab wg-ep-${state}${entered} inline-flex items-center h-[22px] px-2.5 rounded-[6px] text-xs font-medium whitespace-nowrap ${look}` },
                      e.episodeTitle ? e.episodeNumber + " · " + e.episodeTitle : "Episode " + e.episodeNumber,
                    );
                  }),
                )
              : null;
          const paceColor: Record<string, string> = {
            slow: "bg-yellow text-black/80",
            "num-slow": "bg-yellow text-black/80",
            fast: "bg-green text-white",
            blitz: "bg-green text-white",
            ms: "bg-blue text-white",
          };
          const pace =
            info.paceBadge || info.paceLabel
              ? __wgEl(
                  "div",
                  { class: "wg-pace capsule h-[22px] pl-1 pr-2.5 mb-2.5 bg-fill text-xs text-label-2", data: { paceKind: info.paceKind || "normal" } },
                  __wgEl(
                    "span",
                    { class: "wg-pace-badge capsule h-4 px-1.5 text-2xs font-semibold " + (paceColor[info.paceKind || ""] ?? "bg-gray text-white") },
                    info.paceBadge || "1x",
                  ),
                  __wgEl("span", null, info.paceLabel || ""),
                )
              : null;
          const full = info.stepperMode === "full";
          const modules = __wgEl(
            "div",
            {
              id: "wg-modules",
              class: (full ? "wg-modules-full flex-wrap" : "wg-modules-carousel overflow-x-auto snap-x") + " flex gap-1 mb-3 py-0.5",
            },
            info.allNames.map((name, idx) => {
              const state = idx === opts.current ? "current" : idx < opts.doneBefore ? "done" : "upcoming";
              const look =
                state === "current"
                  ? "bg-accent text-on-accent"
                  : state === "done"
                    ? "bg-fill text-label-2"
                    : "text-label-3 shadow-[inset_0_0_0_0.5px_var(--color-separator)]";
              const desc = info.allDescriptions && info.allDescriptions[idx];
              return __wgEl(
                "span",
                { class: `wg-mod wg-mod-${state} capsule flex-none snap-center h-[22px] px-2.5 text-xs font-medium ${look}`, title: desc || undefined },
                state === "done" ? __wgIcon("check", "text-[11px]") : null,
                String(name),
              );
            }),
          );
          return [progress, episodes, pace, modules];
        };
        // "Step 3 of 9" over the step's name; a failure is red, an expected failure orange.
        window.__wgPanelHeading = (kicker, title, tone) => {
          const color = tone === "error" ? "text-red" : tone === "expected" ? "text-orange" : "text-label-2";
          return __wgEl(
            "div",
            { class: "wg-heading flex flex-col gap-0.5 mb-2" },
            __wgEl(
              "span",
              { class: `flex items-center gap-1.5 text-xs font-semibold tabular-nums ${color}` },
              tone ? __wgIcon(tone === "error" ? "error" : "warning") : null,
              kicker,
            ),
            __wgEl("h3", { class: "text-lg font-semibold tracking-tight break-words" }, title),
          );
        };
        // Auto-advance (a switch) and the gate: the action button, or "Auto-advancing" while autoplay is on.
        window.__wgPanelFooter = (label, autoNow, icon) => {
          const autoplay = __wgEl("input", { id: "wg-autoplay-cb", class: "switch", attrs: { type: "checkbox" } });
          autoplay.checked = autoNow;
          return __wgEl(
            "div",
            { class: "wg-footer flex items-center justify-between gap-3 mt-3 pt-3 border-t-[0.5px] border-separator" },
            __wgEl("label", { class: "wg-autoplay-row flex items-center gap-2 text-sm text-label-2 select-none" }, autoplay, "Auto-advance"),
            __wgEl(
              "div",
              { id: "wg-gate-manual", style: autoNow ? "display:none" : "" },
              __wgEl("button", { id: "wg-run", class: "button button-primary h-7 px-3.5", attrs: { type: "button" } }, label, icon ? __wgIcon(icon) : null),
            ),
            __wgEl(
              "div",
              { id: "wg-gate-auto", class: "wg-auto flex items-center gap-1.5 text-sm text-label-2", style: autoNow ? "" : "display:none" },
              __wgEl("span", { class: "wg-spinner" }),
              "Auto-advancing",
            ),
          );
        };
        // The Auto-advance switch: remembered across pages; the gate polls it, so flipping it mid-wait takes effect.
        window.__wgWireAutoplay = () => {
          const cb = __wgById<HTMLInputElement>("wg-autoplay-cb");
          if (!cb || cb.dataset.wgWired) return;
          cb.dataset.wgWired = "1";
          cb.addEventListener("change", () => {
            try {
              localStorage.setItem("wg-autoplay", cb.checked ? "1" : "0");
            } catch {
              /* private mode / blocked storage - the switch still works on this page */
            }
            const manual = __wgById("wg-gate-manual");
            const auto = __wgById("wg-gate-auto");
            if (manual) manual.style.display = cb.checked ? "none" : "";
            if (auto) auto.style.display = cb.checked ? "" : "none";
          });
        };
        // Hide/Show for #wg-panel - call after every panel content refresh.
        // Collapsed = "N / M · block" + Next (when not auto). Never pass
        // forceCollapsed:false - omit so Hide/localStorage wins.
        window.__wgWirePanelChrome = (panel, storageKey, chromeTitle, opts) => {
          if (!panel) return;
          opts = opts || {};
          const ensureChrome = () => {
            let chrome = panel.querySelector(":scope > .wg-chrome");
            if (!chrome) {
              const body = __wgEl("div", { class: "wg-body" });
              while (panel.firstChild) body.appendChild(panel.firstChild);
              panel.append(
                __wgEl(
                  "div",
                  { class: "wg-chrome flex items-center justify-between gap-2 h-7" },
                  __wgEl("span", { class: "wg-chrome-title flex flex-1 items-center gap-1.5 min-w-0 truncate text-xs font-semibold text-label-2" }, chromeTitle || "waygraph demo"),
                  __wgEl(
                    "div",
                    { class: "wg-chrome-actions flex flex-none items-center gap-1" },
                    __wgEl("button", { class: "wg-mini-next button button-primary", attrs: { type: "button", "data-wg-mini-next": "1" } }, "Next"),
                    __wgEl("button", { class: "wg-hide-btn button-plain text-xs", attrs: { type: "button", "data-wg-toggle": "1" } }, "Hide"),
                  ),
                ),
                body,
              );
              return;
            }
            // Yap slides ship a bare chrome - ensure actions + mini Next exist.
            let actions = chrome.querySelector(".wg-chrome-actions");
            if (!actions) {
              actions = __wgEl("div", { class: "wg-chrome-actions flex flex-none items-center gap-1" });
              const hide = chrome.querySelector("[data-wg-toggle]");
              if (hide) actions.appendChild(hide);
              chrome.appendChild(actions);
            }
            if (!actions.querySelector("[data-wg-mini-next]")) {
              actions.insertBefore(
                __wgEl("button", { class: "wg-mini-next button button-primary", attrs: { type: "button", "data-wg-mini-next": "1" } }, "Next"),
                actions.firstChild,
              );
            }
          };
          ensureChrome();
          const stepLabel = opts.stepLabel || panel.dataset.wgStepLabel || "";
          if (stepLabel) panel.dataset.wgStepLabel = stepLabel;
          if (opts.fastForward !== undefined) {
            panel.dataset.wgFastForward = opts.fastForward ? "1" : "0";
          }
          if (opts.isApi !== undefined) {
            panel.dataset.wgIsApi = opts.isApi ? "1" : "0";
          }
          // A fast-forwarded step plays at once with no ring: the collapsed title marks it. An API step (defineApiBlock)
          // changes nothing on the page: marked with a terminal.
          const buildFfIcon = () => __wgIcon("fastForward", "wg-ff-icon text-accent");
          const buildApiIcon = () => __wgIcon("terminal", "wg-api-icon text-teal");
          const syncMiniNext = (hidden: boolean) => {
            const miniNext = panel.querySelector<HTMLButtonElement>("[data-wg-mini-next]");
            if (!miniNext) return;
            let auto = false;
            try {
              auto = localStorage.getItem("wg-autoplay") === "1";
            } catch {
              /* ignore */
            }
            const runBtn = __wgById<HTMLButtonElement>("wg-run");
            const show = !!hidden && !auto && !!runBtn;
            miniNext.classList.toggle("wg-mini-next-show", show);
            if (runBtn) {
              miniNext.textContent = runBtn.textContent || "Next";
              miniNext.disabled = !!runBtn.disabled;
            } else {
              miniNext.disabled = true;
            }
          };
          const apply = (hidden: boolean, persist: boolean) => {
            panel.classList.toggle("wg-collapsed", hidden);
            panel.setAttribute("data-wg-collapsed", hidden ? "1" : "0");
            const t = panel.querySelector("[data-wg-toggle]");
            const titleEl = panel.querySelector(".wg-chrome-title");
            const label = panel.dataset.wgStepLabel || stepLabel;
            const isFf = panel.dataset.wgFastForward === "1";
            const isApi = panel.dataset.wgIsApi === "1";
            if (titleEl) {
              const text = hidden
                ? (label || chromeTitle || "waygraph demo")
                : (chromeTitle || "waygraph demo");
              titleEl.textContent = "";
              if (hidden && isFf) titleEl.appendChild(buildFfIcon());
              if (hidden && isApi) titleEl.appendChild(buildApiIcon());
              titleEl.appendChild(document.createTextNode(text));
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
          const toggle = panel.querySelector<HTMLElement>("[data-wg-toggle]");
          if (toggle && !toggle.dataset.wgWired) {
            toggle.dataset.wgWired = "1";
            toggle.addEventListener("click", (e) => {
              e.stopPropagation();
              apply(!panel.classList.contains("wg-collapsed"), true);
            });
          }
          const miniNext = panel.querySelector<HTMLElement>("[data-wg-mini-next]");
          if (miniNext && !miniNext.dataset.wgWired) {
            miniNext.dataset.wgWired = "1";
            miniNext.addEventListener("click", (e) => {
              e.stopPropagation();
              const runBtn = __wgById<HTMLButtonElement>("wg-run");
              if (runBtn && !runBtn.disabled) {
                runBtn.click();
                return;
              }
              if (typeof window.__wgNext === "function") window.__wgNext({});
            });
          }
          const autoCb = __wgById<HTMLInputElement>("wg-autoplay-cb");
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
}
