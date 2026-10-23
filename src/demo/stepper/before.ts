// Before a demo step runs: play the Block's stubBefore narration (rings, todos, device, title, caption) and show the
// step's panel, then log what was painted so an agent without eyes can check it.
import { runStubPhase } from "../narration/narration.js";
import { applyHighlightStyleDefaults, formatHighlightCaption } from "../narration/style.js";
import type { StubPhaseResult } from "../../engine/narration.js";
import { demoLog, logStubPhaseFixtures, logTodoDockFull, paceSpeakFields, summarizeDevice } from "./demo-log.js";
import { renderBeforeStep } from "./step-panels.js";
import { probeTodoDocksOnPage } from "./todo-dock.js";
import { logBannerDom, probeBanner } from "./banner-log.js";
import { forceCollapsed } from "./view.js";
import type { StepperContext, StepView } from "./view.js";
import { envFlag } from "../../engine/env.js";

const quiet = () => envFlag("WAYGRAPH_JSON");

export async function showBefore(ctx: StepperContext, view: StepView): Promise<void> {
  const { stage } = ctx;
  const phase = await narrateBefore(ctx, view);
  const { appliedTodo } = await stage.applyPhase(phase, { reapplyDeviceOnKeep: true });
  if (phase.title && String(phase.title).trim()) ctx.stickyTitle = String(phase.title).trim();
  view.overlayTitle = ctx.stickyTitle || (view.step.episodeTitle && String(view.step.episodeTitle).trim()) || ctx.title || "waygraph demo";
  view.overlayTodoPos = stage.state.lastTodoDock?.pos || phase.todoPos || undefined;
  const paceSpeak = paceSpeakFields(ctx.pacing.demoPace, ctx.gate.autoplayMs);
  if (!quiet()) logBefore(ctx, view, phase, appliedTodo.sync, paceSpeak.paceLabel);

  const step = view.step;
  await renderBeforeStep(ctx.page, {
    index: view.index,
    total: ctx.steps.length,
    blockName: step.block.name,
    description: step.block.description || "",
    keys: memKeysOf(ctx, view),
    allNames: view.moduleNames,
    allDescriptions: view.moduleDescriptions,
    moduleIndex: view.moduleIndex,
    allEpisodes: ctx.allEpisodes,
    justEnteredEpisode: view.justEnteredEpisode,
    title: view.overlayTitle,
    bannerUi: stage.state.lastBannerUi,
    caption: phase.caption,
    networkTabVisible: phase.networkTabVisible,
    fastForward: !!step.block.fastForward,
    isApi: step.block.__waygraphKind === "api",
    todoPos: view.overlayTodoPos,
    episodeNumber: step.episodeNumber,
    episodeTitle: step.episodeTitle,
    stepperMode: ctx.stepperMode,
    forceCollapsed: forceCollapsed(),
    todos: stage.state.lastTodoDock?.groups[0]?.items || phase.todos || [],
    todoDock: stage.state.lastTodoDock,
    todoSync: appliedTodo.sync,
    todoId: stage.state.lastTodoDock?.id,
    ...paceSpeak,
  });
  // renderBeforeStep syncs the active dock; this repaints every dock so a replaced one is gone.
  await stage.syncAllTodoDocks({ parallel: !!phase.todoParallel });
  if (!quiet()) {
    await logDocks(ctx, "", !!stage.state.lastTodoDock);
    logBannerDom("before", await probeBanner(ctx.page));
  }
}

/** Runs the Block's stubBefore and remembers its rings, so a fill/click inside the step can find its ring. */
async function narrateBefore(ctx: StepperContext, view: StepView): Promise<StubPhaseResult> {
  const phase = await runStubPhase(view.step.block, "stubBefore", { mem: ctx.mem });
  await ctx.stage.pushTodoDockUi(phase.todoDockUi);
  ctx.refs.stubBefore.current = phase.highlights.map((h) => applyHighlightStyleDefaults(h, view.step.highlightStyle));
  logStubPhaseFixtures("before", {
    ...phase,
    highlights: ctx.refs.stubBefore.current.map((h) => ({ ...h, label: formatHighlightCaption(h) })),
  });
  return phase;
}

/** The step's `requires` keys and their current values, editable in the panel. */
function memKeysOf(ctx: StepperContext, view: StepView): { name: string; value: string }[] {
  return (view.step.block.requires ?? []).map((k) => {
    let value = "<not yet set>";
    try {
      value = JSON.stringify(ctx.mem.get(k));
    } catch {
      // not written yet - shown as a placeholder, not a crash
    }
    return { name: k.name, value };
  });
}

function logBefore(ctx: StepperContext, view: StepView, phase: StubPhaseResult, todoSync: string, paceLabel: string): void {
  const { step } = view;
  demoLog(`step ${view.index + 1}/${ctx.steps.length} ${step.block.name} · ${paceLabel}` + (step.episodeNumber ? " · episode " + step.episodeNumber : ""));
  demoLog(`  gate~${ctx.gate.autoplayMs}ms skipTheater=${!!ctx.pacing.skipTheater} gatesFast=${!!ctx.pacing.gatesFast}`);
  demoLog("  " + summarizeDevice(ctx.stage.state.lastDevice));
  const zoom = phase.zoom != null && Number(phase.zoom) > 0 ? Number(phase.zoom) : null;
  const zoomOut = phase.zoomOut !== undefined ? !!phase.zoomOut : null;
  demoLog(
    "  zoom=" + (zoom != null ? zoom + "x" : "default") + (zoomOut != null ? " zoomOut=" + zoomOut : "") +
      " (StubCtx / API; live chip top-left when ring zoom >1)",
  );
  logTodoDockFull(ctx.stage.state.lastTodoDock, "  before");
  demoLog("  todoSync=" + todoSync);
}

/** Logs where the todo docks actually landed on the page, warning when authored todos never painted. */
export async function logDocks(ctx: StepperContext, tag: string, expectDock: boolean, cleared = false): Promise<void> {
  const docks = await probeTodoDocksOnPage(ctx.page);
  if (!docks.length && expectDock && !cleared) {
    demoLog(tag ? `  WARN ${tag.trim()}: todos authored but dock-dom empty` : "  WARN todos authored but dock-dom empty (not painted?)");
  } else if (docks.length) {
    demoLog(
      `  ${tag}dock-dom ` +
        docks
          .map((d: any) => `${d.key}@${d.pos} ${d.left},${d.top} ${d.w}x${d.h}` + (d.onScreen ? "" : " OFFSCREEN") + ` n=${d.n}` + (d.current ? ` cur="${d.current}"` : ""))
          .join(" | "),
    );
  } else if (cleared) {
    demoLog(`  ${tag}dock-dom cleared (expected)`);
  }
}
