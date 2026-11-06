// After a demo step ran: play its stubAfter narration (its slides, then its rings; without one, ring what its checks
// looked at), then its Expect Blocks' narration, show how it went (what was expected, ticked in turn, and what the page
// now shows that changed), show the result panel, then wait at the Next gate.
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
import { lastRead, takeReadChanges, type ReadChange } from "./last-read.js";
import { showOutcome, tickOutcome } from "../overlay/inpage/outcome.js";
import { ignorePageGone } from "../../engine/page-gone.js";
import { showSlides } from "./slides.js";
import { expectationsFor, takeExpectResults, type ExpectResult } from "../../engine/run/expect.js";
import { takeCheckedElements } from "../../engine/trait/verify.js";
import type { StepperContext, StepView } from "./view.js";
import { forceCollapsed } from "./view.js";

const quiet = () => envFlag("WAYGRAPH_JSON");

export async function showAfter(ctx: StepperContext, view: StepView, result: Checkpoint<string>): Promise<void> {
  const { stage, refs } = ctx;
  const expects = takeExpectResults(ctx.page);
  const changes = takeReadChanges();
  const after = hasAuthoredStubAfter(view.step.block, result) ? await narrateAfter(ctx, view, result) : undefined;
  const expectRings = await narrateExpectations(ctx, view, result);
  if (after) await showSlides(ctx, view, after.phase.slides);
  const applied = after ? await stage.applyPhase(after.phase) : { appliedTodo: { sync: "keep" as const }, appliedDevice: { sync: "keep" as const } };
  await showOutcomeCard(ctx, expects, changes);

  await renderAfterStep(ctx.page, {
    index: view.index,
    total: ctx.steps.length,
    blockName: view.step.block.name,
    result,
    resultTag: JSON.stringify(result),
    highlights: [...(after?.highlights ?? checkedRings(ctx, view, expects, expectRings)), ...expectRings],
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

/**
 * No stubAfter: ring what the step's checks looked at (its verify and its expectations), once each, labelled in words: an
 * expectation's own (an Expect Block's description), else what the check looked for (`shows`, `reads "Saved"`). An
 * element an Expect Block's narration already rings isn't ringed twice.
 */
function checkedRings(ctx: StepperContext, view: StepView, expects: readonly ExpectResult[], narrated: readonly ResolvedHighlight[]): ResolvedHighlight[] {
  const seen = new Set<string>(narrated.map((h) => h.selector));
  return takeCheckedElements(ctx.page)
    .filter((c) => !seen.has(c.selector) && !!seen.add(c.selector))
    .map((c) => {
      const label = expects.find((e) => e.ok && e.selectors.includes(c.selector))?.text ?? c.says ?? c.check;
      return applyHighlightStyleDefaults({ selector: c.selector, label, tone: "auto" }, view.step.highlightStyle);
    });
}

/** At most this many changed values on the card; the rest are in the step panel's read. */
const MAX_CHANGES = 5;

/** How the step went, on a card that shows whether the panel is open: its expectations ticked in turn, then what changed. */
export async function showOutcomeCard(ctx: StepperContext, expects: readonly ExpectResult[], changes: readonly ReadChange[]): Promise<void> {
  if (!quiet()) {
    for (const e of expects) demoLog(`  expected ${e.ok ? "ok" : "FAILED"}: ${e.text}${e.ok || !e.saw ? "" : ` (saw ${e.saw})`}`);
    for (const c of changes) demoLog(`  now shows ${c.key}: ${c.from} -> ${c.to}`);
  }
  if (expects.length === 0 && changes.length === 0) return;
  const card = {
    expects: expects.map((e) => ({ text: e.text, ok: e.ok, ...(e.saw ? { saw: e.saw } : {}) })),
    changes: changes.slice(0, MAX_CHANGES),
    moreChanges: Math.max(0, changes.length - MAX_CHANGES),
  };
  await ctx.page.evaluate(showOutcome, card).catch(ignorePageGone);
  const beat = ctx.pacing.gatesFast ? 120 : 450;
  for (const [i] of expects.entries()) {
    await new Promise((r) => setTimeout(r, beat));
    await ctx.page.evaluate(tickOutcome, i).catch(ignorePageGone);
  }
}

/**
 * The narration of the step's Expect Blocks (a case's to-do marked, a caption, a ring), played after the step in the
 * order they're listed: an expectation isn't a step of its own, so this is where its narration shows.
 */
async function narrateExpectations(ctx: StepperContext, view: StepView, result: Checkpoint<string>): Promise<ResolvedHighlight[]> {
  const rings: ResolvedHighlight[] = [];
  for (const item of expectationsFor(view.step.block, result.__state)) {
    if (!("instruction" in item)) continue;
    for (const phase of ["stubBefore", "stubAfter"] as const) {
      const played = await runStubPhase(item, phase, { out: result, mem: ctx.mem });
      // Its slides first, then its rings, as a step's own narration plays.
      await showSlides(ctx, view, played.slides);
      await ctx.stage.applyPhase(played);
      rings.push(...played.highlights.map((h) => applyHighlightStyleDefaults(h, view.step.highlightStyle)));
    }
  }
  return rings;
}
