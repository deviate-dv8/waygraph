// The demo panel after a step: what it resolved to (pretty / JSON), its rings, and the Next gate.
import { ignorePageGone } from "../../engine/page-gone.js";
import { installOverlay } from "../overlay/overlay.js";
import { cycleHighlightRings } from "../overlay/rings.js";
import type { Checkpoint } from "../../engine/checkpoint/checkpoint.js";
import type { DemoPace } from "../../engine/stub/pace.js";
import type { ResolvedHighlight } from "../../engine/stub/ring.js";
import type { TodoDockState } from "../../engine/stub/todos.js";
import type { Ref, WgPage } from "../types.js";
import { miniStepLabel, type PanelTodos, type StepPanelInfo } from "./step-panels.js";

/** The panel after a step: the Checkpoint it resolved to, the rings to cycle, and whether it was the last step. */
export interface AfterPanelInfo extends StepPanelInfo, PanelTodos {
  result: Checkpoint<string>;
  resultTag: string;
  highlights: readonly ResolvedHighlight[];
  gatesFast?: boolean | undefined;
  isLast: boolean;
  pace?: DemoPace | undefined;
  todoDockRef?: Ref<TodoDockState | undefined> | undefined;
}


export async function renderAfterStep(page: WgPage, info: AfterPanelInfo) {
  await installOverlay(page, info.title, info.bannerUi, info.caption, info.networkTabVisible);
  // Clear any tracker from a previous highlight before cycling through this
  // step's own.
  await page
    .evaluate(() => {
      if (window.__wgRingTrack) {
        window.removeEventListener("resize", window.__wgRingTrack);
        window.removeEventListener("scroll", window.__wgRingTrack, true);
        window.__wgRingTrack = null;
      }
    })
    .catch(ignorePageGone);
  const highlights = info.highlights || [];
  const gatesFast = !!info.gatesFast;
  // Cycle through EVERY declared/recovered highlight in order, each shown
  // long enough to actually register - "it highlights something [...] then
  // it highlights something [else] and next," not just the first one.
  // duration / fastMode on stubAfter (or flow fixtures) override the default
  // 900ms / 200ms holds when set.
  await cycleHighlightRings(page, highlights, gatesFast, {
    pace: info.pace,
    stepLabel: miniStepLabel(info),
    todoDock: info.todoDock,
    todos: info.todos,
    todoSync: info.todoSync,
    todoDockRef: info.todoDockRef,
    // stubAfter already authored progress - do not re-index by ring 0..n
    advanceTodos: false,
  });
  // After-ring advances may have moved the dock - surface latest for caller.
  if (info.todoDockRef && info.todoDockRef.current) {
    info.todoDock = info.todoDockRef.current;
  }
  const afterPayload = { ...info, stepLabel: miniStepLabel(info) };
  await page
    .evaluate((info) => {
      // Reused in place - see renderBeforeStep's own comment on this.
      let panel = __wgById("wg-panel");
      const isNewPanel = !panel;
      if (!panel) {
        panel = document.createElement("div");
        panel.id = "wg-panel";
      }
      const pct = Math.round(((info.index + 1) / info.total) * 100);
      const heading = info.isLast
        ? "End of chain - " + info.total + " / " + info.total + " blocks covered - " + info.blockName + " done"
        : "Step " + (info.index + 1) + " / " + info.total + " - " + info.blockName + " done";
      const buttonLabel = info.isLast ? "Finish" : "Next \u25B6";
      const modulesClass = info.stepperMode === "full" ? "wg-modules-full" : "wg-modules-carousel";
      const modules = info.allNames.map((name, idx) => {
        const cls = idx <= info.moduleIndex ? "wg-mod-done" : "wg-mod-upcoming";
        const desc = info.allDescriptions && info.allDescriptions[idx];
        return __wgEl("span", { class: "wg-mod " + cls, title: desc || undefined }, String(name));
      });
      // QA-friendly by default ("LoginSuccess" -> "Login Success") - raw
      // JSON is one click away for whoever actually wants __state.
      const stateTag = info.result && info.result.__state ? info.result.__state : "";
      const prettyText = stateTag
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") || info.resultTag;
      const pretty = window.__wgPretty !== false;
      let autoNow = false;
      try {
        autoNow = localStorage.getItem("wg-autoplay") === "1";
      } catch {
        /* private mode / blocked storage - defaults to manual */
      }
      const autoplay = __wgEl("input", { id: "wg-autoplay-cb", attrs: { type: "checkbox" } });
      autoplay.checked = autoNow;
      const episodes = info.allEpisodes && info.allEpisodes.length > 0
        ? __wgEl(
          "div",
          { id: "wg-episodes" },
          info.allEpisodes.map((e) => {
            const cls = e.episodeNumber < (info.episodeNumber ?? 0) ? "wg-ep-done"
              : e.episodeNumber === info.episodeNumber ? "wg-ep-current"
                : "wg-ep-upcoming";
            return __wgEl("span", { class: "wg-ep-tab " + cls }, "Episode " + e.episodeNumber + ": " + (e.episodeTitle || ""));
          })
        )
        : null;
      const pace = info.paceBadge || info.paceLabel
        ? __wgEl(
          "div",
          { class: "wg-pace", data: { paceKind: info.paceKind || "normal" } },
          __wgEl("span", { class: "wg-pace-badge" }, info.paceBadge || "1x"),
          __wgEl("span", null, info.paceLabel || "")
        )
        : null;
      // Todos float in #wg-todo-dock via __wgSyncTodos, never in the panel.
      __wgSet(
        panel,
        __wgEl("div", { id: "wg-progress" }, __wgEl("div", { id: "wg-progress-bar", style: "width:" + pct + "%" })),
        episodes,
        pace,
        __wgEl("div", { id: "wg-modules", class: modulesClass }, modules),
        __wgEl("h3", null, heading),
        __wgEl(
          "div",
          { class: "wg-toggle" },
          __wgEl("button", { class: "wg-toggle-btn" + (pretty ? " wg-active" : ""), data: { mode: "pretty" } }, "Pretty"),
          __wgEl("button", { class: "wg-toggle-btn" + (pretty ? "" : " wg-active"), data: { mode: "json" } }, "JSON")
        ),
        __wgEl("div", { class: "wg-result wg-result-pretty", style: "display:" + (pretty ? "block" : "none") }, String(prettyText)),
        __wgEl("div", { class: "wg-result wg-result-json", style: "display:" + (pretty ? "none" : "block") }, String(info.resultTag)),
        __wgEl("div", { class: "wg-autoplay-row" }, __wgEl("label", null, autoplay, " Auto-advance")),
        __wgEl("div", { id: "wg-gate-manual", style: autoNow ? "display:none" : "" }, __wgEl("button", { id: "wg-run" }, buttonLabel)),
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
          const payload: WgTodoSyncPayload = {
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
          phase: "after",
          step: info.index + 1,
          total: info.total,
          block: info.blockName || "",
          ready: true,
        });
      }
      panel.querySelectorAll<HTMLElement>(".wg-toggle-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const wantPretty = btn.getAttribute("data-mode") === "pretty";
          window.__wgPretty = wantPretty;
          panel.querySelectorAll<HTMLElement>(".wg-toggle-btn").forEach((b) => b.classList.remove("wg-active"));
          btn.classList.add("wg-active");
          panel.querySelector<HTMLElement>(".wg-result-pretty")!.style.display = wantPretty ? "block" : "none";
          panel.querySelector<HTMLElement>(".wg-result-json")!.style.display = wantPretty ? "none" : "block";
        });
      });
      const runBtn = __wgById<HTMLButtonElement>("wg-run");
      if (runBtn) runBtn.addEventListener("click", () => window.__wgNext({}));
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
    }, afterPayload)
    .catch(ignorePageGone);
}
