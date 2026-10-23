// The demo's step-through UI: before each step a panel (what's about to happen, its mem, the Next gate), after it the
// result (rings, slides, todos), and on a failure a panel with Retry / Stop. The runner's demo mode calls these
// around each step it plays.
import type { Checkpoint } from "../../engine/checkpoint/checkpoint.js";
import type { MemPage } from "../../engine/mem/mem.js";
import type { WgPage } from "../types.js";
import { createOverlayStage } from "../overlay/overlay-stage.js";
import { instrumentInteractionHighlighting } from "./interaction-patch.js";
import { markStepRunning, restoreTheaterAfterNavigation, teardownOverlay } from "./teardown.js";
import { keepOverlayOnNavigation } from "../overlay/reattach.js";
import { presentFailPanel } from "./step-panels.js";
import { installGate } from "./gate.js";
import { newPacing, paceStep } from "./pacing.js";
import { showBefore } from "./before.js";
import { showAfter } from "./after.js";
import { episodesOf, viewOf } from "./view.js";
import type { StepperContext, StepperStep, StepView } from "./view.js";

export interface Stepper {
  /** After the page was reset between episodes: storage was wiped, so the auto-advance setting is put back. */
  afterReset(): Promise<void>;
  before(index: number): Promise<void>;
  after(index: number, result: Checkpoint<string>): Promise<void>;
  /** A step threw, or reached the failure its flow expects: show why, then the person picks Retry or Stop. */
  failed(index: number, failure: { error?: unknown; result?: Checkpoint<string> | undefined }): Promise<"retry" | "stop">;
  end(): Promise<void>;
}

export interface StepperOptions {
  title: string | undefined;
  /** Block names that skip the added dwell (WAYGRAPH_FAST_BLOCKS). */
  fastBlocks: Set<string>;
  /** Waygraph's own beat after each action, in ms. */
  beat: number;
}

export async function createStepper(page: WgPage, mem: MemPage, steps: readonly StepperStep[], options: StepperOptions): Promise<Stepper> {
  const demoFast = process.env.WAYGRAPH_DEMO_FAST === "1";
  const pacing = newPacing(demoFast);
  const refs = { stubBefore: { current: [] as any[] }, todoDock: { current: undefined as any }, device: { current: undefined as any } };
  instrumentInteractionHighlighting(page, mem, options.beat, pacing, refs.stubBefore, refs.todoDock, refs.device);
  // A navigation inside a step (a redirect, a login bounce) repaints the overlay with the step's todos, device and ring.
  keepOverlayOnNavigation(page, () => restoreTheaterAfterNavigation(page, refs.todoDock, refs.device, refs.stubBefore));
  keepWindowSize(page);
  const gate = await installGate(page, pacing, demoFast);
  await gate.syncAutoplay();
  const ctx: StepperContext = {
    page,
    mem,
    steps,
    stage: createOverlayStage(page, { todoDockRef: refs.todoDock, deviceRef: refs.device }),
    gate,
    pacing,
    refs,
    title: options.title,
    stepperMode: process.env.WAYGRAPH_STEPPER === "full" ? "full" : "carousel",
    stickyTitle: undefined,
    allEpisodes: episodesOf(steps),
  };
  let view: StepView;

  return {
    afterReset: gate.syncAutoplay,

    async before(index) {
      view = viewOf(ctx, index);
      paceStep(pacing, view.step, demoFast, options.fastBlocks);
      await showBefore(ctx, view);
      applyMemEdits(ctx, view, await gate.wait());
      await markStepRunning(page, {});
      await labelNavClick(page, view.step);
    },

    async after(_index, result) {
      await stepRan(ctx);
      await showAfter(ctx, view, result);
    },

    async failed(index, failure) {
      await stepRan(ctx);
      const step = view.step;
      const edits = await presentFailPanel(page, {
        block: step.block,
        highlightStyle: step.highlightStyle,
        error: failure.error,
        ...(failure.result ? { out: failure.result } : {}),
        index,
        total: steps.length,
        blockName: step.block.name,
        message: failure.result
          ? "Resolved " + (failure.result.__state ?? JSON.stringify(failure.result)) + " (expected failure path)"
          : failure.error instanceof Error ? failure.error.message : String(failure.error),
        allNames: view.moduleNames,
        allDescriptions: view.moduleDescriptions,
        moduleIndex: view.moduleIndex,
        allEpisodes: ctx.allEpisodes,
        title: options.title,
        episodeNumber: step.episodeNumber,
        episodeTitle: step.episodeTitle,
        expectedFailureReason: step.expectedFailureReason,
        stepperMode: ctx.stepperMode,
        gatesFast: pacing.gatesFast,
        demoPace: pacing.demoPace,
        gate: gate.wait,
        mem,
      });
      return edits && edits.__wgRetry ? "retry" : "stop";
    },

    end: () => teardownOverlay(page),
  };
}

/**
 * Some Blocks call page.setViewportSize() in their own act for their own tests; in a watched demo that would resize
 * the window, so it does nothing here. An authored ctx.device() still resizes through __wgRealSetViewportSize.
 */
function keepWindowSize(page: WgPage): void {
  page.__wgRealSetViewportSize = page.setViewportSize.bind(page);
  page.setViewportSize = async () => {};
}

/** Values typed into the panel's mem fields replace the step's inputs (left as authored when not valid JSON). */
function applyMemEdits(ctx: StepperContext, view: StepView, edits: Record<string, string>): void {
  for (const k of view.step.block.requires ?? []) {
    if (edits[k.name] === undefined) continue;
    try {
      ctx.mem.set(k, JSON.parse(edits[k.name]!));
    } catch {
      // left as-authored if the human's edit isn't valid JSON
    }
  }
}

/** A click-based Nav Block's cursor reads "nav: <block>", like any other Block's click. */
async function labelNavClick(page: WgPage, step: StepperStep): Promise<void> {
  const label = step.block.__waygraphKind === "nav" && step.block.__waygraphNavClick !== undefined ? "nav: " + (step.block.name || "click") : undefined;
  await page
    .evaluate((l: string | undefined) => {
      if (l) window.__wgPendingNavClickLabel = l;
      else delete window.__wgPendingNavClickLabel;
    }, label)
    .catch(() => {});
}

/** The step finished: drop its nav label, and keep the todo dock it advanced for the steps after it. */
async function stepRan(ctx: StepperContext): Promise<void> {
  await ctx.page.evaluate(() => delete window.__wgPendingNavClickLabel).catch(() => {});
  if (ctx.refs.todoDock.current) ctx.stage.state.lastTodoDock = ctx.refs.todoDock.current;
}
