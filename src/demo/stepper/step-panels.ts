// The stepper's panels: before a step (what will happen, its mem), after it (the result and rings), and on failure.
import { stopRingTracker } from "../overlay/rings.js";
import { ignorePageGone } from "../../engine/page-gone.js";
import { hasAuthoredStubOnError, runStubPhase } from "../narration/narration.js";
import { applyHighlightStyleDefaults, formatHighlightCaption } from "../narration/style.js";
import { installOverlay } from "../overlay/overlay.js";
import { cycleHighlightRings } from "../overlay/rings.js";
import type { SomeBlock } from "../../engine/block/some-block.js";
import type { Checkpoint } from "../../engine/checkpoint/checkpoint.js";
import type { MemPage } from "../../engine/mem/mem.js";
import type { HighlightStyleDefaults, ResolvedHighlight } from "../../engine/stub/ring.js";
import type { TodoDockState, WaygraphTodoItem } from "../../engine/stub/todos.js";
import type { DemoPace } from "../../engine/stub/pace.js";
import type { BannerUiState, WgPage } from "../types.js";

/** What every step panel shows: where the step sits in the run and its episode, its pace, and how the panel looks. */
export interface StepPanelInfo {
  index: number;
  total: number;
  blockName: string;
  allNames: readonly string[];
  allDescriptions?: readonly string[] | undefined;
  moduleIndex: number;
  allEpisodes?: readonly { episodeNumber: number; episodeTitle: string }[] | undefined;
  episodeNumber?: number | undefined;
  episodeTitle?: string | undefined;
  title?: string | undefined;
  bannerUi?: BannerUiState | null | undefined;
  caption?: string | undefined;
  networkTabVisible?: boolean | undefined;
  stepperMode?: "full" | "carousel" | undefined;
  forceCollapsed?: boolean | undefined;
  fastForward?: boolean | undefined;
  isApi?: boolean | undefined;
  paceBadge?: string | undefined;
  paceLabel?: string | undefined;
  paceKind?: string | undefined;
}

/** The todo dock a panel syncs when it paints. */
export interface PanelTodos {
  todos?: readonly WaygraphTodoItem[] | undefined;
  todoDock?: TodoDockState | undefined;
  todoSync?: "set" | "clear" | "keep" | undefined;
  todoId?: string | undefined;
  todoPos?: string | undefined;
}

/** A failed step: what threw (or the expected-failure result), its stubOnError narration, and the Retry/Stop gate. */
export interface FailPanelOptions extends StepPanelInfo {
  block: SomeBlock;
  highlightStyle?: HighlightStyleDefaults | undefined;
  error: unknown;
  out?: Checkpoint<string>;
  message: string;
  expectedFailureReason?: string | undefined;
  gatesFast?: boolean | undefined;
  demoPace?: DemoPace | undefined;
  gate: () => Promise<Record<string, string>>;
  mem: MemPage;
}

type ErrorPanelInfo = Omit<FailPanelOptions, "block" | "highlightStyle" | "error" | "out" | "gatesFast" | "demoPace" | "gate" | "mem">;

export function miniStepLabel(info: Pick<StepPanelInfo, "episodeNumber" | "index" | "total" | "blockName" | "paceBadge">) {
  const ep =
    info.episodeNumber !== undefined && info.episodeNumber !== null
      ? "Ep " + info.episodeNumber + " \u00b7 "
      : "";
  return (
    ep +
    (info.index + 1) +
    " / " +
    info.total +
    (info.blockName ? " \u00b7 " + info.blockName : "") +
    (info.paceBadge ? " \u00b7 " + info.paceBadge : "")
  );
}


/**
 * stubOnError rings + amber "expected outcome" / red error panel, then wait
 * for Stop/Retry. Used when a step throws OR when a `map({ expectedFailure })` flow's last
 * block succeeds on the intentional fail branch (e.g. LoginPage + error banner).
 */
export async function presentFailPanel(page: WgPage, opts: FailPanelOptions) {
  const {
    block,
    error,
    index,
    total,
    blockName,
    message,
    allNames,
    allDescriptions,
    moduleIndex,
    allEpisodes,
    title,
    episodeNumber,
    episodeTitle,
    expectedFailureReason,
    stepperMode,
    gatesFast,
    demoPace,
    gate,
    mem,
  } = opts;
  if (hasAuthoredStubOnError(block)) {
    await stopRingTracker(page);
    const errPhase = await runStubPhase(block, "stubOnError", {
      error,
      out: opts.out,
      mem,
    });
    const errHighlights = errPhase.highlights.map((h) => {
      const styled = applyHighlightStyleDefaults(h, opts.highlightStyle);
      return { ...styled, label: formatHighlightCaption(styled), focus: !!styled.focus };
    });
    await cycleHighlightRings(page, errHighlights, !!gatesFast, {
      defaultHoldMs: 2000,
      pace: demoPace,
      todos: errPhase.todos,
    });
  }
  await renderStepError(page, {
    index,
    total,
    blockName,
    message,
    allNames,
    allDescriptions,
    moduleIndex,
    allEpisodes,
    title,
    episodeNumber,
    episodeTitle,
    expectedFailureReason,
    stepperMode,
  });
  return gate();
}


/**
 * A Block threw - act()/observe() rejected, or Flow.run's own verify Trait
 * check failed. Shown instead of letting it crash the whole Node process
 * silently from a human's point of view (the browser closes right after
 * regardless - main()'s own try/finally - but not before this is visible).
 */
async function renderStepError(page: WgPage, info: ErrorPanelInfo) {
  await installOverlay(page, info.title, info.bannerUi, info.caption, info.networkTabVisible);
  const errorPayload = { ...info, stepLabel: miniStepLabel(info) };
  await page
    .evaluate((info) => {
      const { panel, isNew: isNewPanel } = window.__wgPanel!();
      const isExpected = !!info.expectedFailureReason;
      panel.classList.remove("wg-error", "wg-expected");
      panel.classList.add(isExpected ? "wg-expected" : "wg-error");
      if (!isNewPanel) panel.classList.add("wg-in");
      const retryLabel = info.episodeNumber !== undefined ? "Retry Episode " + info.episodeNumber : "Retry";
      __wgSet(
        panel,
        window.__wgPanelFrame!(info, { current: info.moduleIndex, doneBefore: info.moduleIndex, progress: null }),
        window.__wgPanelHeading!(
          isExpected
            ? "Step " + (info.index + 1) + " of " + info.total + " · failed as expected"
            : "Step " + (info.index + 1) + " of " + info.total + " · failed",
          info.blockName,
          isExpected ? "expected" : "error",
        ),
        isExpected
          ? __wgEl("div", { class: "wg-expected-reason rounded-card bg-orange/12 px-3 py-2 mb-2 text-sm font-medium" }, String(info.expectedFailureReason))
          : null,
        __wgEl(
          "div",
          { class: "wg-error-msg rounded-card bg-fill px-3 py-2.5 font-mono text-sm whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto" },
          String(info.message),
        ),
        __wgEl(
          "div",
          { class: "wg-error-actions flex justify-end gap-2 mt-3 pt-3 border-t-[0.5px] border-separator" },
          __wgEl("button", { id: "wg-run", class: "wg-error-stop button button-destructive h-7 px-3.5", attrs: { type: "button" } }, __wgIcon("stop"), "Stop"),
          __wgEl("button", { id: "wg-error-retry", class: "wg-error-retry button button-primary h-7 px-3.5", attrs: { type: "button" } }, __wgIcon("retry"), retryLabel),
        ),
      );
      window.__wgShowPanel!(panel, isNewPanel, info, "error");
      const runBtn = __wgById<HTMLButtonElement>("wg-run");
      if (runBtn) runBtn.addEventListener("click", () => window.__wgNext({}));
      const retryBtn = __wgById("wg-error-retry");
      if (retryBtn) retryBtn.addEventListener("click", () => window.__wgNext({ __wgRetry: "1" }));
    }, errorPayload)
    .catch(ignorePageGone);
}


/**
 * The elements a Block's verify looked at (each built-in Trait's `selector`), to ring after the step. A Trait with none
 * (url-matches, a hand-written one) rings nothing; the panel still shows the result.
 */
export function extractVerifyHighlights(block: SomeBlock, resultTag: string) {
  let verify = block.instruction && block.instruction.verify;
  if (typeof verify === "function") {
    try {
      verify = verify({ __state: resultTag });
    } catch {
      verify = [];
    }
  }
  if (!Array.isArray(verify)) return [];
  const highlights: ResolvedHighlight[] = [];
  for (const t of verify) {
    if (t?.selector) highlights.push({ selector: t.selector, label: t.name, tone: "auto" });
  }
  return highlights;
}
