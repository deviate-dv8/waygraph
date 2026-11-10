// `waygraph demo`: the same steps, with the waygraph UI around each one (src/demo/stepper/).
import { createStepper } from "../../demo/stepper/stepper.js";
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
