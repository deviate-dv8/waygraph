// In-page installer (runs inside the browser via page.evaluate): must stay self-contained - no module-scope closure.
// Split out of the former single installOverlay evaluate (see src/ARCHITECTURE.md). Shares state only via window.__wg*.
/* eslint-disable no-unused-vars */
export function installPanelChrome({ title, favicon, bannerPos, todoPos, envAutoplay, todoDockUi }) {
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
            const runBtn = __wgById("wg-run");
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
              const runBtn = __wgById("wg-run");
              if (runBtn && !runBtn.disabled) {
                runBtn.click();
                return;
              }
              if (typeof window.__wgNext === "function") window.__wgNext({});
            });
          }
          const autoCb = __wgById("wg-autoplay-cb");
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
