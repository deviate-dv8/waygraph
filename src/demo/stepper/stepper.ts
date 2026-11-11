// The demo's step-through UI: before each step a panel (what's about to happen, its mem, the Next gate), after it the
// result (rings, slides, todos), and on a failure a panel with Retry / Stop. The runner's demo mode calls these
// around each step it plays.
import { trackReads } from "./last-read.js";
import type { Checkpoint } from "../../engine/checkpoint/checkpoint.js";
import type { MemPage } from "../../engine/mem/mem.js";
import type { StepperRefs, WgPage } from "../types.js";
import { createOverlayStage } from "../overlay/overlay-stage.js";
import { instrumentInteractionHighlighting } from "./interaction-patch.js";
import { markStepRunning, restoreTheaterAfterNavigation, teardownOverlay } from "./teardown.js";
import { keepOverlayOnNavigation } from "../overlay/reattach.js";
import { LivePiece, overlayLayer } from "../overlay/overlay-layer.js";
import { applyDeviceToPage } from "../overlay/device-stage.js";
import { presentFailPanel } from "./step-panels.js";
import { installGate } from "./gate.js";
import { newPacing, paceStep } from "./pacing.js";
import { showBefore } from "./before.js";
import { renderBeforeStep, type BeforePanelInfo } from "./panel-before.js";
import { showAfter } from "./after.js";
import { showOutcomeCard } from "./outcome.js";
import { takeExpectResults } from "../../engine/run/expect.js";
import { episodesOf, viewOf } from "./view.js";
import type { StepperContext, StepperStep, StepView } from "./view.js";
import { envFlag, envString } from "../../engine/env.js";
import { ignorePageGone } from "../../engine/page-gone.js";
import { setActing } from "../overlay/acting.js";
import { showFinish, type FinishCard } from "../overlay/inpage/finish.js";
import { ensureShadowRoot } from "../overlay/ui/shadow.js";
import { demoLog } from "./demo-log.js";
import { blinksOf, traceOverlay } from "../overlay/trace.js";
import { configuredDevice } from "../overlay/device-config.js";

export interface Stepper {
  /** After the page was reset between episodes: storage was wiped, so the auto-advance setting is put back. */
  afterReset(): Promise<void>;
  before(index: number): Promise<void>;
  after(index: number, result: Checkpoint<string>): Promise<void>;
  /** A step threw, or reached the failure its flow expects: show why, then the person picks Retry or Stop. */
  failed(index: number, failure: { error?: unknown; result?: Checkpoint<string> | undefined }): Promise<"retry" | "stop">;
  /** The steps ended: the overlay goes, and a card says it's done and how it went, held a moment before the page closes. */
  end(ended: DemoEnd): Promise<void>;
}

/** How a demo ended: every step played, it stopped on a failure, or it reached the failure its flow expects. */
export interface DemoEnd {
  stoppedAt?: { index: number; block: string; message: string } | undefined;
  expectedFailure?: string | undefined;
}

export interface StepperOptions {
  title: string | undefined;
  /** Block names that skip the added dwell (WAYGRAPH_FAST_BLOCKS). */
  fastBlocks: Set<string>;
  /** Waygraph's own beat after each action, in ms. */
  beat: number;
}

/** The finish card: how the demo ended, its title, and how many steps it played in how long. */
function finishCard(ended: DemoEnd, title: string, steps: number, ms: number): FinishCard {
  const summary = `${steps} ${steps === 1 ? "step" : "steps"} · ${(ms / 1000).toFixed(1)} s`;
  if (ended.stoppedAt) {
    const { index, block, message } = ended.stoppedAt;
    return { status: "stopped", title, summary, detail: `Step ${index + 1}, ${block}: ${message.split("\n")[0]}` };
  }
  if (ended.expectedFailure) return { status: "expected", title, summary, detail: ended.expectedFailure };
  return { status: "passed", title, summary };
}

export async function createStepper(page: WgPage, mem: MemPage, steps: readonly StepperStep[], options: StepperOptions): Promise<Stepper> {
  const startedAt = Date.now();
  const demoFast = envFlag("WAYGRAPH_DEMO_FAST");
  const pacing = newPacing(demoFast);
  // The after-step panel shows what the page shows (its step:read).
  trackReads();
  // The person watching can't use the page while the demo plays; the chip in the corner unlocks it.
  await page.addInitScript(() => ((window as unknown as { __wgDemoLock?: boolean }).__wgDemoLock = true)).catch(ignorePageGone);
  await page.evaluate(() => ((window as unknown as { __wgDemoLock?: boolean }).__wgDemoLock = true)).catch(ignorePageGone);
  const refs: StepperRefs = { stubBefore: { current: [] }, todoDock: { current: undefined }, device: { current: undefined } };
  instrumentInteractionHighlighting(page, mem, options.beat, pacing, refs.stubBefore, refs.todoDock, refs.device);
  // The todo docks and the device are pieces of the page's overlay layer, painted from what the steps carry: a navigation
  // inside a step (a redirect, a login bounce, an external site) brings them back with the rest of the layer.
  const layer = overlayLayer(page);
  // WAYGRAPH_OVERLAY_TRACE: each piece of the overlay showing and going, in the demo log.
  const traced = envFlag("WAYGRAPH_OVERLAY_TRACE") ? await traceOverlay(page, demoLog) : undefined;
  // The running step's panel (collapsed, with the steps' progress): a page load inside the step paints it again. First,
  // so the docks after it repaint over the panel's own todo sync.
  let running: BeforePanelInfo | undefined;
  layer.register(
    new LivePiece("step-panel", async (p) => {
      if (!running) return;
      await renderBeforeStep(p, running);
      await markStepRunning(p);
    }),
  );
  layer.register(
    new LivePiece("todos", async (p) => {
      const dock = refs.todoDock.current;
      if (dock) await p.evaluate((d) => window.__wgSyncTodos?.({ sync: "set", dock: d }), dock);
    }),
  );
  layer.register(
    new LivePiece("device", async (p) => {
      if (refs.device.current) await applyDeviceToPage(p, refs.device.current, "set");
    }),
  );
  // A demo on the config's device (a phone, a tablet, turned): its stage (the recording, or the window) shows the
  // device from the first step.
  const device = configuredDevice();
  if (device) {
    refs.device.current = {
      preset: device.preset,
      viewport: { ...device.viewport, deviceScaleFactor: device.deviceScaleFactor },
      isMobile: device.isMobile,
      hasTouch: device.hasTouch,
      touchMode: device.hasTouch,
      orientation: device.orientation,
    };
    await applyDeviceToPage(page, refs.device.current, "set");
  }
  keepOverlayOnNavigation(page, () => restoreTheaterAfterNavigation(page, refs.stubBefore));
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
    stepperMode: envString("WAYGRAPH_STEPPER") === "full" ? "full" : "carousel",
    stickyTitle: undefined,
    allEpisodes: episodesOf(steps),
  };
  // The steps keep the config's device until one sets another (ctx.ui.device).
  if (refs.device.current) ctx.stage.state.lastDevice = refs.device.current;
  let view: StepView;

  return {
    afterReset: gate.syncAutoplay,

    async before(index) {
      view = viewOf(ctx, index);
      paceStep(pacing, view.step, demoFast, options.fastBlocks);
      const panel = await showBefore(ctx, view);
      applyMemEdits(ctx, view, await gate.wait());
      running = panel;
      await markStepRunning(page);
      await labelNavClick(page, view.step);
    },

    async after(_index, result) {
      running = undefined;
      await stepRan(ctx);
      await showAfter(ctx, view, result);
    },

    async failed(index, failure) {
      running = undefined;
      await stepRan(ctx);
      const step = view.step;
      // An expectation that didn't hold: the card shows which held and which didn't, next to the fail panel.
      await showOutcomeCard(ctx, takeExpectResults(page), []);
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

    async end(ended) {
      if (traced) {
        const blinks = Object.entries(blinksOf(traced()));
        demoLog(`overlay blinks: ${blinks.length ? blinks.map(([piece, n]) => `${piece} ${n}`).join(", ") : "none"}`);
      }
      await teardownOverlay(page);
      const card = finishCard(ended, ctx.stickyTitle || options.title || "waygraph stepper", steps.length, Date.now() - startedAt);
      if (!envFlag("WAYGRAPH_JSON")) demoLog(`finished: ${card.status} · ${card.summary}${card.detail ? ` · ${card.detail}` : ""}`);
      await ensureShadowRoot(page).catch(ignorePageGone);
      await page.evaluate(showFinish, card).catch(ignorePageGone);
      // Long enough to read (and to be in a recording) before the page closes.
      await new Promise((r) => setTimeout(r, pacing.gatesFast ? 500 : 2500));
    },
  };
}

/**
 * Some Blocks call page.setViewportSize() in their own act for their own tests; in a watched demo that would resize
 * the window, so it does nothing here. An authored ctx.ui.device() still resizes through __wgRealSetViewportSize.
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
    .catch(ignorePageGone);
}

/** The step finished: drop its nav label, and keep the todo dock it advanced for the steps after it. */
async function stepRan(ctx: StepperContext): Promise<void> {
  await setActing(ctx.page, false);
  await ctx.page.evaluate(() => delete window.__wgPendingNavClickLabel).catch(ignorePageGone);
  if (ctx.refs.todoDock.current) ctx.stage.state.lastTodoDock = ctx.refs.todoDock.current;
}
