// The demo panel after a step: what it resolved to (pretty / JSON), its rings, and the Next gate.
import { stopRingTracker } from "../overlay/rings.js";
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
  /** What the page shows now, from its Read Blocks (by namespace). */
  read?: Record<string, unknown> | undefined;
}


export async function renderAfterStep(page: WgPage, info: AfterPanelInfo) {
  await installOverlay(page, info.title, info.bannerUi, info.caption, info.networkTabVisible);
  // Clear any tracker from a previous highlight before cycling through this
  // step's own.
  await stopRingTracker(page);
  const highlights = info.highlights || [];
  const gatesFast = !!info.gatesFast;
  // Cycle through EVERY declared/recovered highlight in order, each shown
  // long enough to actually register - "it highlights something [...] then
  // it highlights something [else] and next," not just the first one.
  // duration / fastMode on stubAfter rings override the default
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
      const { panel, isNew: isNewPanel } = window.__wgPanel!();
      const stateTag = info.result && info.result.__state ? info.result.__state : "";
      const prettyText =
        stateTag.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") || info.resultTag;
      const pretty = window.__wgPretty !== false;
      let autoNow = false;
      try {
        autoNow = localStorage.getItem("wg-autoplay") === "1";
      } catch {
        /* private mode / blocked storage - defaults to manual */
      }
      const segment = (mode: string, label: string, on: boolean) =>
        __wgEl(
          "button",
          {
            class: "wg-toggle-btn h-[18px] px-2 rounded-[5px] text-2xs font-medium " + (on ? "wg-active bg-control shadow-control text-label" : "text-label-2"),
            data: { mode },
            attrs: { type: "button" },
          },
          label,
        );
      __wgSet(
        panel,
        window.__wgPanelFrame!(info, {
          current: null,
          doneBefore: info.moduleIndex + 1,
          progress: Math.round(((info.index + 1) / info.total) * 100),
        }),
        window.__wgPanelHeading!(
          info.isLast ? "Finished · " + info.total + " of " + info.total : "Step " + (info.index + 1) + " of " + info.total + " · done",
          info.blockName,
        ),
        __wgEl(
          "div",
          { class: "flex items-center justify-between gap-2 mb-1.5" },
          __wgEl("span", { class: "text-xs font-medium text-label-2" }, "Landed on"),
          __wgEl("div", { class: "wg-toggle segmented" }, segment("pretty", "Pretty", pretty), segment("json", "JSON", !pretty)),
        ),
        __wgEl(
          "div",
          { class: "wg-result wg-result-pretty flex items-center gap-2 rounded-card bg-fill px-3 py-2 text-lg font-semibold", style: "display:" + (pretty ? "flex" : "none") },
          __wgIcon("done", "text-green"),
          String(prettyText),
        ),
        __wgEl(
          "div",
          { class: "wg-result wg-result-json rounded-card bg-fill px-3 py-2 font-mono text-sm whitespace-pre-wrap", style: "display:" + (pretty ? "none" : "block") },
          String(info.resultTag),
        ),
        // What the page shows now (its Read Blocks), one line per value; open by the person who wants it.
        info.read
          ? __wgEl(
              "details",
              { class: "wg-read mt-3 rounded-card bg-fill" },
              __wgEl("summary", { class: "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-label-2 cursor-default select-none" }, __wgIcon("chevronRight", "wg-read-chevron"), "The page shows"),
              __wgEl(
                "dl",
                { class: "grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 px-3 pb-2 max-h-40 overflow-y-auto font-mono text-2xs" },
                Object.entries(info.read).flatMap(([ns, fields]) =>
                  Object.entries((fields ?? {}) as Record<string, unknown>).map(([field, value]) => [
                    __wgEl("dt", { class: "text-label-2" }, ns + "." + field),
                    __wgEl("dd", { class: "truncate", title: JSON.stringify(value) }, value === null ? "-" : typeof value === "string" ? value : JSON.stringify(value)),
                  ]),
                ),
              ),
            )
          : null,
        window.__wgPanelFooter!(info.isLast ? "Finish" : "Next", autoNow, info.isLast ? undefined : "next"),
      );
      window.__wgShowPanel!(panel, isNewPanel, info, "after");
      panel.querySelectorAll<HTMLElement>(".wg-toggle-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const wantPretty = btn.getAttribute("data-mode") === "pretty";
          window.__wgPretty = wantPretty;
          const on = ["wg-active", "bg-control", "shadow-control", "text-label"];
          panel.querySelectorAll<HTMLElement>(".wg-toggle-btn").forEach((b) => {
            b.classList.remove(...on);
            b.classList.add("text-label-2");
          });
          btn.classList.remove("text-label-2");
          btn.classList.add(...on);
          panel.querySelector<HTMLElement>(".wg-result-pretty")!.style.display = wantPretty ? "flex" : "none";
          panel.querySelector<HTMLElement>(".wg-result-json")!.style.display = wantPretty ? "none" : "block";
        });
      });
      const runBtn = __wgById<HTMLButtonElement>("wg-run");
      if (runBtn) runBtn.addEventListener("click", () => window.__wgNext({}));
      window.__wgWireAutoplay!();
    }, afterPayload)
    .catch(ignorePageGone);
}
