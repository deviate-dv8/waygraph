// What the stepper's panels show about the run as a whole and about the current step.
import type { MemPage } from "../../core/mem-page.js";
import type { Block } from "../../core/types.js";
import type { DemoPace, HighlightStyleDefaults } from "../../core/narration.js";
import type { WgPage } from "../types.js";
import type { createOverlayStage } from "../overlay/overlay-stage.js";
import type { Gate } from "./gate.js";
import type { Pacing } from "./pacing.js";

/** A step as the stepper sees it (the runner's PlayStep). */
export interface StepperStep {
  block: Block<any, any> & { description?: string; fastForward?: boolean; demoPace?: DemoPace; __waygraphKind?: string; __waygraphNavClick?: unknown };
  episodeNumber?: number | undefined;
  episodeTitle?: string | undefined;
  expectedFailureReason?: string | undefined;
  demoPace?: DemoPace | undefined;
  highlightStyle?: HighlightStyleDefaults | undefined;
  wasFastForward?: boolean | undefined;
}

/** The stepper's state for the whole run. */
export interface StepperContext {
  page: WgPage;
  mem: MemPage;
  steps: readonly StepperStep[];
  stage: ReturnType<typeof createOverlayStage>;
  gate: Gate;
  pacing: Pacing;
  refs: { stubBefore: { current: any[] }; todoDock: { current: any }; device: { current: any } };
  title: string | undefined;
  stepperMode: "full" | "carousel";
  /** A title set by a stub (`ctx.title`) names the flow from that step on, until another stub sets a new one. */
  stickyTitle: string | undefined;
  allEpisodes: { episodeNumber: number; episodeTitle: string }[];
}

/** The current step: where it sits in its episode, and what its before panel showed. */
export interface StepView {
  index: number;
  step: StepperStep;
  /** The breadcrumb is this step's episode ("1st of 2"), or the whole chain when there are no episodes. */
  moduleNames: string[];
  moduleDescriptions: string[];
  moduleIndex: number;
  justEnteredEpisode: boolean;
  overlayTitle: string;
  overlayTodoPos: string | undefined;
}

export function episodesOf(steps: readonly StepperStep[]): StepperContext["allEpisodes"] {
  const episodes: StepperContext["allEpisodes"] = [];
  for (const s of steps) {
    if (s.episodeNumber && !episodes.some((e) => e.episodeNumber === s.episodeNumber)) {
      episodes.push({ episodeNumber: s.episodeNumber, episodeTitle: s.episodeTitle ?? "" });
    }
  }
  return episodes;
}

export function viewOf(ctx: StepperContext, index: number): StepView {
  const step = ctx.steps[index]!;
  const indices = step.episodeNumber
    ? ctx.steps.flatMap((s, i) => (s.episodeNumber === step.episodeNumber ? [i] : []))
    : ctx.steps.map((_s, i) => i);
  const moduleIndex = indices.indexOf(index);
  return {
    index,
    step,
    moduleNames: indices.map((i) => ctx.steps[i]!.block.name),
    moduleDescriptions: indices.map((i) => ctx.steps[i]!.block.description || ""),
    moduleIndex,
    justEnteredEpisode: moduleIndex === 0 && step.episodeNumber !== undefined,
    overlayTitle: ctx.title || "waygraph demo",
    overlayTodoPos: undefined,
  };
}

/** Video and --mini get the compact pill; never false, so the person's Hide/Show choice wins otherwise. */
export function forceCollapsed(): true | undefined {
  const env = process.env;
  return env.WAYGRAPH_VIDEO || env.WAYGRAPH_MINI === "1" || env.WAYGRAPH_STEPPER_MINI === "1" ? true : undefined;
}

