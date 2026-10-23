// `waygraph demo`: the same steps, with the waygraph UI around each one (src/demo/stepper/).
import { createStepper } from "../../demo/stepper/stepper.js";
import type { Mode, PlaySession, PlayStep } from "../mode.js";
import type { PlayOptions } from "../options.js";

export async function demoMode(session: PlaySession, steps: readonly PlayStep[], options: PlayOptions, beat: number): Promise<Mode> {
  const stepper = await createStepper(session.page, session.mem, steps, { title: options.title, fastBlocks: options.fastBlocks, beat });
  return {
    name: "demo",
    afterReset: stepper.afterReset,
    before: stepper.before,
    after: (index, result) => stepper.after(index, result),
    failed: (index, failure) => stepper.failed(index, failure),
    end: () => stepper.end(),
  };
}
