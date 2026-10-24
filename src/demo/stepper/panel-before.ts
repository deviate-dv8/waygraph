// The demo panel before a step: episode and step chips, pace, the mem it reads (editable), and the Run gate.
import { envFlag, envString } from "../../engine/env.js";
import { ignorePageGone, ignoreTimeout } from "../../engine/page-gone.js";
import { installOverlay } from "../overlay/overlay.js";
import type { WgPage } from "../types.js";
import { miniStepLabel } from "./step-panels.js";


export async function renderBeforeStep(page: WgPage, info: any) {
  await installOverlay(page, info.title, info.bannerUi, info.caption, info.networkTabVisible);
  // A ring left highlighting the PREVIOUS step's element (and its live
  // resize/scroll tracker) shouldn't linger once a new step's own panel is
  // up - only relevant when a Block's act() doesn't navigate away, since a
  // real navigation already wipes document.documentElement's children.
  await page
    .evaluate(() => {
      if (window.__wgRingTrack) {
        window.removeEventListener("resize", window.__wgRingTrack);
        window.removeEventListener("scroll", window.__wgRingTrack, true);
        window.__wgRingTrack = null;
      }
      if (window.__wgHideRing) window.__wgHideRing();
      if (window.__wgHideCursor) window.__wgHideCursor();
    })
    .catch(ignorePageGone);
  // miniStepLabel / todosHtmlFromInfo are Node-only — browser evaluate has no closure.
  const payload = { ...info, stepLabel: miniStepLabel(info) };
  await page
    .evaluate((info: any) => {
      // Reused in place, not removed + recreated, every step - the old
      // remove()-then-fade-back-in cycle was a real flash on every single
      // transition (the user: "the appear and disappear... hurts eyes and
      // dizzy"). Updating one persistent element's content has nothing to
      // flash - it only ever fades in ONCE, the first time this page
      // genuinely has no panel yet (a real navigation wiped the whole
      // document, or this is the very first step).
      let panel = __wgById("wg-panel");
      const isNewPanel = !panel;
      if (!panel) {
        panel = document.createElement("div");
        panel.id = "wg-panel";
      }
      const pct = Math.round((info.index / info.total) * 100);
      // A real tab bar, not a single text line - every episode this chain
      // touches, the current one reading as active (the user: "if episode 1 is
      // active, the episode 2 tab is inactive"). Absent entirely for an ad
      // hoc block chain with no named Flows.
      const episodes = info.allEpisodes && info.allEpisodes.length > 0
        ? __wgEl(
          "div",
          { id: "wg-episodes" },
          info.allEpisodes.map((e: any) => {
            const cls = e.episodeNumber < info.episodeNumber ? "wg-ep-done"
              : e.episodeNumber === info.episodeNumber ? "wg-ep-current"
                : "wg-ep-upcoming";
            // The gentle one-time glow only plays on the tab actually
            // being entered right now, not on every render of it.
            const enteredCls = info.justEnteredEpisode && e.episodeNumber === info.episodeNumber
              ? " wg-ep-entered"
              : "";
            return __wgEl("span", { class: "wg-ep-tab " + cls + enteredCls }, "Episode " + e.episodeNumber + ": " + (e.episodeTitle || ""));
          })
        )
        : null;
      // Scoped to THIS episode's own blocks (info.allNames is already the
      // episode-local subset the caller computed) - moduleIndex is this
      // step's position WITHIN that subset, not the whole chain's index -
      // "in episode 2 it shows 2nd to the last... it should start from the
      // first block" (the user).
      const modulesClass = info.stepperMode === "full" ? "wg-modules-full" : "wg-modules-carousel";
      const modules = info.allNames.map((name: any, idx: number) => {
        const cls = idx < info.moduleIndex ? "wg-mod-done" : idx === info.moduleIndex ? "wg-mod-current" : "wg-mod-upcoming";
        const desc = info.allDescriptions && info.allDescriptions[idx];
        return __wgEl("span", { class: "wg-mod " + cls, title: desc || undefined }, String(name));
      });
      const pace = info.paceBadge || info.paceLabel
        ? __wgEl(
          "div",
          { class: "wg-pace", data: { paceKind: info.paceKind || "normal" } },
          __wgEl("span", { class: "wg-pace-badge" }, info.paceBadge || "1x"),
          __wgEl("span", null, info.paceLabel || "")
        )
        : null;
      const keys = info.keys.length === 0
        ? [__wgEl("div", { class: "wg-key" }, "(no MemKeys required)")]
        : info.keys.map((k: any) => {
          const field = __wgEl("textarea", { data: { key: k.name }, attrs: { rows: 2 } });
          field.value = k.value;
          return __wgEl("div", { class: "wg-key" }, __wgEl("label", null, k.name), field, __wgEl("div", { class: "wg-key-pretty", data: { prettyFor: k.name } }));
        });
      let autoNow = false;
      try {
        autoNow = localStorage.getItem("wg-autoplay") === "1";
      } catch {
        /* private mode / blocked storage - defaults to manual */
      }
      const autoplay = __wgEl("input", { id: "wg-autoplay-cb", attrs: { type: "checkbox" } });
      autoplay.checked = autoNow;
      // Todos render into floating #wg-todo-dock via __wgSyncTodos - never
      // inside .wg-body (would vanish under --mini / Hide collapse).
      __wgSet(
        panel,
        __wgEl("div", { id: "wg-progress" }, __wgEl("div", { id: "wg-progress-bar", style: "width:" + pct + "%" })),
        episodes,
        pace,
        __wgEl("div", { id: "wg-modules", class: modulesClass }, modules),
        __wgEl("h3", null, "Step " + (info.index + 1) + " / " + info.total + " - " + info.blockName),
        info.description ? __wgEl("div", { class: "wg-narration" }, info.description) : null,
        keys,
        __wgEl("div", { class: "wg-autoplay-row" }, __wgEl("label", null, autoplay, " Auto-advance")),
        __wgEl("div", { id: "wg-gate-manual", style: autoNow ? "display:none" : "" }, __wgEl("button", { id: "wg-run" }, "Run this step \u25B6")),
        __wgEl("div", { id: "wg-gate-auto", class: "wg-auto", style: autoNow ? "" : "display:none" }, "Auto-advancing...")
      );
      if (isNewPanel) {
        __wgAdd(panel);
        requestAnimationFrame(() => panel.classList.add("wg-in"));
      } else {
        panel.classList.add("wg-in");
      }
      if (window.__wgWirePanelChrome) {
        window.__wgWirePanelChrome(panel, "wg-panel-hidden", "waygraph demo", {
          stepLabel: info.stepLabel || "",
          forceCollapsed: info.forceCollapsed === true ? true : undefined,
          fastForward: !!info.fastForward,
          isApi: !!info.isApi,
        });
      }
      if (window.__wgSyncTodos) {
        const sync = info.todoSync || (info.todos && info.todos.length ? "set" : "keep");
        // Prefer dock-only payload. Passing list:[] with a dock used to clear
        // marks a frame later (empty-list clear path).
        if (sync === "keep" && !info.todoDock) {
          /* leave floating dock alone */
        } else {
          const payload: Record<string, any> = {
            sync: sync,
            dock: info.todoDock || null,
            pos: info.todoPos || null,
            todoId: info.todoId || (info.todoDock && info.todoDock.id) || null,
          };
          if (!info.todoDock && info.todos && info.todos.length) {
            payload.list = info.todos;
          }
          window.__wgSyncTodos(payload);
        }
      }
      if (window.__wgStampModal) {
        window.__wgStampModal(panel, "panel", {
          phase: "before",
          step: info.index + 1,
          total: info.total,
          block: info.blockName || "",
          ready: true,
        });
      }
      // Live, human-readable preview of what a MemKey's raw JSON will
      // actually write - object fields become "Field: value" lines
      // (camelCase split the same way state tags already are); a
      // non-object payload (a plain string/number/array) is shown as-is.
      // Hidden entirely in JSON mode - shares the SAME global toggle the
      // result display's own Pretty/JSON buttons already set, not a
      // second, separate preference.
      const prettyMemValue = (raw: any): WgChild[] => {
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return [__wgEl("em", null, "(invalid JSON)")];
        }
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          return [JSON.stringify(parsed)];
        }
        return Object.entries(parsed).map(([field, value]) => {
          const label = field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
          return __wgEl("div", { class: "wg-key-pretty-row" }, __wgEl("span", { class: "wg-key-pretty-label" }, label + ":"), " " + String(value));
        });
      };
      const applyKeyPretty = () => {
        const prettyOn = window.__wgPretty !== false;
        panel.querySelectorAll<HTMLTextAreaElement>("textarea[data-key]").forEach((ta) => {
          const previewEl = ta.parentElement?.querySelector<HTMLElement>(".wg-key-pretty");
          if (!previewEl) return;
          previewEl.style.display = prettyOn ? "" : "none";
          if (prettyOn) __wgSet(previewEl, prettyMemValue(ta.value));
        });
      };
      applyKeyPretty();
      panel.querySelectorAll<HTMLTextAreaElement>("textarea[data-key]").forEach((ta) => {
        ta.addEventListener("input", applyKeyPretty);
      });
      const runBtn = __wgById<HTMLButtonElement>("wg-run");
      if (runBtn) {
        runBtn.addEventListener("click", () => {
          const edits: Record<string, any> = {};
          panel.querySelectorAll<HTMLTextAreaElement>("textarea[data-key]").forEach((el) => {
            edits[el.getAttribute("data-key") ?? ""] = el.value;
          });
          window.__wgNext(edits);
        });
      }
      // Live toggle - flips localStorage immediately so an in-flight gate()
      // poll (on the Node side) picks it up within its next poll slice,
      // without needing this whole panel to re-render. A manual click
      // still always wins over an active autoplay wait, whichever the
      // checkbox says - this is the "hybrid" control: autoplay is a
      // default, not a lockout.
      const cb = __wgById<HTMLInputElement>("wg-autoplay-cb");
      if (cb) {
        cb.addEventListener("change", () => {
          try {
            localStorage.setItem("wg-autoplay", cb.checked ? "1" : "0");
          } catch {
            /* private mode / blocked storage - toggle still works this page */
          }
          const manual = __wgById("wg-gate-manual");
          const auto = __wgById("wg-gate-auto");
          if (manual) manual.style.display = cb.checked ? "none" : "";
          if (auto) auto.style.display = cb.checked ? "" : "none";
        });
      }
    }, payload)
    .catch(ignorePageGone);
  if (envString("WAYGRAPH_PROVE_SHOT") || envFlag("WAYGRAPH_PROVE_EXIT")) {
    // Default: prove once on first painted panel. PROVE_EVERY=1 re-checks
    // every step (noisy; useful when hunting a mid-chain blank).
    const proveEvery = envFlag("WAYGRAPH_PROVE_EVERY");
    const already = (globalThis as { __wgProveDone?: boolean; }).__wgProveDone;
    if (!already || proveEvery || envFlag("WAYGRAPH_PROVE_EXIT")) {
      await page.waitForTimeout(500).catch(ignoreTimeout);
      const shot = envString("WAYGRAPH_PROVE_SHOT");
      if (shot) await page.screenshot({ path: shot }).catch(ignorePageGone);
      const ok = await page
        .evaluate(() => {
          const beacons = typeof window.__wgOverlayBeacon === "function" ? window.__wgOverlayBeacon() : [];
          const panel = beacons.find((b) => b.modal === "panel" && b.ready && b.visible);
          const textOk = panel && panel.textLen >= 12;
          const opacityOk = panel && Number(panel.opacity) > 0.5;
          return {
            ok: !!(panel && textOk && opacityOk),
            beacons,
            hasRun: !!__wgById<HTMLButtonElement>("wg-run"),
            readyAttr: __wgById("wg-panel")?.getAttribute("data-wg-ready") || null,
          };
        })
        .catch((e: any) => ({ ok: false, reason: String(e instanceof Error ? e.message : e) }));
      console.error("WAYGRAPH_PROVE " + JSON.stringify(ok));
      (globalThis as { __wgProveDone?: boolean; }).__wgProveDone = true;
      if (envFlag("WAYGRAPH_PROVE_EXIT")) {
        process.exit(ok && ok.ok ? 0 : 2);
      }
    }
  }
}
