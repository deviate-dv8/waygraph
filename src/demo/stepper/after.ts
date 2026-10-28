// After a demo step ran: play its stubAfter narration (its slides, then its rings; without one, ring what verify checked),
// show the result panel, then wait at the Next gate.
import type { Checkpoint } from "../../engine/checkpoint/checkpoint.js";
import { envFlag } from "../../engine/env.js";
import type { ResolvedHighlight } from "../../engine/stub/ring.js";
import type { StubPhaseResult } from "../../engine/stub/stub.js";
import { hasAuthoredStubAfter, runStubPhase } from "../narration/narration.js";
import { applyHighlightStyleDefaults, formatHighlightCaption } from "../narration/style.js";
import { logBannerDom, probeBanner } from "./banner-log.js";
import { logDocks } from "./before.js";
import { demoLog, logStubPhaseFixtures, logTodoDockFull, paceSpeakFields, summarizeDevice } from "./demo-log.js";
import { renderAfterStep } from "./panel-after.js";
import { lastRead } from "./last-read.js";
import { showSlides } from "./slides.js";
import { extractVerifyHighlights } from "./step-panels.js";
import type { StepperContext, StepView } from "./view.js";
import { forceCollapsed } from "./view.js";

const quiet = () => envFlag("WAYGRAPH_JSON");

export async function showAfter(ctx: StepperContext, view: StepView, result: Checkpoint<string>): Promise<void> {
  const { stage, refs } = ctx;
  const after = hasAuthoredStubAfter(view.step.block, result) ? await narrateAfter(ctx, view, result) : undefined;
  if (after) await showSlides(ctx, view, after.phase.slides);
  const applied = after ? await stage.applyPhase(after.phase) : { appliedTodo: { sync: "keep" as const }, appliedDevice: { sync: "keep" as const } };

  await renderAfterStep(ctx.page, {
    index: view.index,
    total: ctx.steps.length,
    blockName: view.step.block.name,
    result,
    resultTag: JSON.stringify(result),
    highlights: after?.highlights ?? verifyRings(view, result),
    gatesFast: ctx.pacing.gatesFast,
    ...paceSpeakFields(ctx.pacing.demoPace, ctx.gate.autoplayMs),
    isLast: view.index === ctx.steps.length - 1,
    allNames: view.moduleNames,
    allDescriptions: view.moduleDescriptions,
    moduleIndex: view.moduleIndex,
    allEpisodes: ctx.allEpisodes,
    title: after?.phase.title && String(after.phase.title).trim() ? String(after.phase.title).trim() : view.overlayTitle,
    bannerUi: stage.state.lastBannerUi,
    // undefined leaves the caption and network tab as they are
    caption: after?.phase.caption,
    networkTabVisible: after?.phase.networkTabVisible,
    fastForward: !!view.step.block.fastForward,
    isApi: view.step.block.__waygraphKind === "api",
    todoPos: after ? stage.state.lastTodoDock?.pos || after.phase.todoPos || view.overlayTodoPos : view.overlayTodoPos,
    episodeNumber: view.step.episodeNumber,
    episodeTitle: view.step.episodeTitle,
    stepperMode: ctx.stepperMode,
    todos: after ? stage.state.lastTodoDock?.groups[0]?.items || after.phase.todos || [] : [],
    todoDock: stage.state.lastTodoDock,
    todoSync: applied.appliedTodo.sync,
    todoId: stage.state.lastTodoDock?.id,
    todoDockRef: refs.todoDock,
    forceCollapsed: forceCollapsed(),
    read: lastRead(),
  });
  const parallel = !!after?.phase.todoParallel;
  await stage.syncAllTodoDocks({ parallel });
  // The ring cycle or stubAfter may have advanced the dock; the next step starts from there.
  if (refs.todoDock.current) {
    stage.state.lastTodoDock = refs.todoDock.current;
    stage.rememberTodoDock(refs.todoDock.current, "set", parallel);
  }
  if (!quiet()) {
    demoLog("  after " + summarizeDevice(stage.state.lastDevice) + " deviceSync=" + applied.appliedDevice.sync);
    logTodoDockFull(stage.state.lastTodoDock, "  after");
    demoLog("  after todoSync=" + applied.appliedTodo.sync);
    await logDocks(ctx, "after ", !!stage.state.lastTodoDock, applied.appliedTodo.sync === "clear");
    logBannerDom("after", await probeBanner(ctx.page));
  }
  await ctx.gate.wait();
}

/** Runs the Block's stubAfter; its rings carry the flow's highlight style and a caption. */
async function narrateAfter(ctx: StepperContext, view: StepView, result: Checkpoint<string>): Promise<{ phase: StubPhaseResult; highlights: ResolvedHighlight[] }> {
  const style = view.step.highlightStyle;
  const phase = await runStubPhase(view.step.block, "stubAfter", { out: result, mem: ctx.mem });
  if (phase.todoDockUi) await ctx.stage.pushTodoDockUi(phase.todoDockUi);
  logStubPhaseFixtures("after", {
    ...phase,
    highlights: (phase.highlights || []).map((h) => {
      const styled = applyHighlightStyleDefaults(h, style);
      return { ...styled, label: formatHighlightCaption(styled) };
    }),
  });
  const highlights = phase.highlights.map((h) => {
    // The ring's look and timing only; its todo, gesture and cursor belong to stubBefore.
    const styled = applyHighlightStyleDefaults(h, style);
    const { tag: _tag, cursor: _cursor, todo: _todo, slotId: _slotId, gesture: _gesture, ...ring } = styled;
    return { ...ring, label: formatHighlightCaption(styled), focus: !!styled.focus };
  });
  return { phase, highlights };
}

/** No stubAfter: ring what the Block's verify checked. */
function verifyRings(view: StepView, result: Checkpoint<string>): ResolvedHighlight[] {
  return extractVerifyHighlights(view.step.block, result.__state).map((h) => applyHighlightStyleDefaults(h, view.step.highlightStyle));
}
