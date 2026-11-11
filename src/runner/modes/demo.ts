// `waygraph demo`: the same steps, with the waygraph UI around each one (src/demo/stepper/).
import type { Page } from "@playwright/test";
import { createStepper, type Stepper } from "../../demo/stepper/stepper.js";
import { stepPage } from "../../engine/run/pane-page.js";
import { messageOf } from "../../engine/errors.js";
import { voiceOf } from "../../demo/voice-over.js";
import type { Mode, PlaySession, PlayStep } from "../mode.js";
import type { PlayOptions } from "../options.js";

export async function demoMode(session: PlaySession, steps: readonly PlayStep[], options: PlayOptions, beat: number): Promise<Mode> {
  // A voice that speaks steps makes their descriptions now, while the first steps play.
  const voice = voiceOf(session.page);
  if (voice?.steps) voice.prepare(steps.map((s) => s.block.description ?? ""));
  const stepper = await createStepper(session.page, session.mem, steps, { title: options.title, fastBlocks: options.fastBlocks, beat });
  return {
    name: "demo",
    afterReset: stepper.afterReset,
    before: stepper.before,
    after: (index, result) => stepper.after(index, result),
    failed: (index, failure) => stepper.failed(index, failure),
    end: (outcome) =>
      stepper.end({
        stoppedAt: outcome.failedAt
          ? { index: outcome.failedAt.index, block: outcome.failedAt.step.block.name, message: messageOf(outcome.failedAt.error) }
          : undefined,
        expectedFailure: outcome.expectedFailure?.reason,
      }),
  };
}

/**
 * `waygraph demo` of a flow with panes: each pane has its own waygraph UI (its panel, rings and captions), on its own
 * page. On the stage it's watched, not clicked, so the demo moves on by itself; in windows, Next works as usual.
 */
export async function splitDemoMode(session: PlaySession, steps: readonly PlayStep[], options: PlayOptions, beat: number): Promise<Mode> {
  const autoAdvance = options.split === "stage";
  const steppers = new Map<Page, Promise<Stepper>>();
  /** The UI of the pane step `index` acts in, made when the pane first acts. */
  const stepperFor = async (index: number): Promise<Stepper> => {
    const page = await stepPage(steps[index]!.block, session.page, session.mem);
    let stepper = steppers.get(page);
    if (!stepper) {
      stepper = createStepper(page, session.mem, steps, { title: options.title, fastBlocks: options.fastBlocks, beat, autoAdvance });
      steppers.set(page, stepper);
    }
    return stepper;
  };
  return {
    name: "demo",
    // A reset closes the panes; the next episode opens its own, with their own UI.
    afterReset: async () => steppers.clear(),
    before: async (index) => (await stepperFor(index)).before(index),
    after: async (index, result) => (await stepperFor(index)).after(index, result),
    failed: async (index, failure) => (await stepperFor(index)).failed(index, failure),
    end: async (outcome) => {
      const ended = {
        stoppedAt: outcome.failedAt
          ? { index: outcome.failedAt.index, block: outcome.failedAt.step.block.name, message: messageOf(outcome.failedAt.error) }
          : undefined,
        expectedFailure: outcome.expectedFailure?.reason,
      };
      await Promise.all([...steppers.values()].map(async (stepper) => (await stepper).end(ended)));
    },
  };
}
