// How fast one demo step goes: its own pace, else its flow's, else the config's; --fast and WAYGRAPH_FAST_BLOCKS only
// speed up steps nobody gave a pace. The interaction patches read this object live while the step runs.
import type { DemoPace } from "../../engine/narration.js";
import { demoPaceIsBlitz, demoPaceIsFast, demoPaceIsSlow, normalizeDemoPace, resolveStepDemoPace } from "../narration/demo-pace.js";
import { envString } from "../../engine/env.js";

export interface Pacing {
  /** Shorter Next gates (keeps the smooth cursor). */
  gatesFast: boolean;
  gatesSlow: boolean;
  /** Skip the overlay's added dwell entirely (blitz, fast-forward, WAYGRAPH_FAST_BLOCKS). */
  skipTheater: boolean;
  demoPace: DemoPace;
}

export function newPacing(demoFast: boolean): Pacing {
  return { gatesFast: demoFast, gatesSlow: false, skipTheater: false, demoPace: "normal" };
}

interface PacedStep {
  block: { name: string; demoPace?: DemoPace | string | number | null; fastForward?: boolean };
  demoPace?: DemoPace | undefined;
  wasFastForward?: boolean | undefined;
}

const isSet = (pace: unknown): boolean => pace != null && pace !== "";

export function paceStep(pacing: Pacing, step: PacedStep, demoFast: boolean, fastBlocks: Set<string>): void {
  const defaultPace = envString("WAYGRAPH_DEMO_PACE") ? normalizeDemoPace(envString("WAYGRAPH_DEMO_PACE")) : undefined;
  const fastForward = !!step.block.fastForward || !!step.wasFastForward;
  const flowPace = step.demoPace ?? defaultPace;
  const stepPace = resolveStepDemoPace({
    ...(step.block.demoPace !== undefined ? { blockPace: step.block.demoPace } : {}),
    ...(flowPace !== undefined ? { flowPace } : {}),
    fastForward: !!step.block.fastForward,
    wasFastForward: !!step.wasFastForward,
  });
  const authoredPace = isSet(step.block.demoPace) || isSet(step.demoPace) || defaultPace != null;
  const listedFast = fastBlocks.has(step.block.name);
  pacing.demoPace = stepPace === "normal" && (demoFast || listedFast) && !authoredPace ? (listedFast ? "blitz" : "fast") : stepPace;
  pacing.gatesFast = demoPaceIsFast(pacing.demoPace) || fastForward || (!authoredPace && demoFast);
  pacing.gatesSlow = demoPaceIsSlow(pacing.demoPace);
  pacing.skipTheater = demoPaceIsBlitz(pacing.demoPace) || listedFast || fastForward;
}
