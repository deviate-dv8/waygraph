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
 * `waygraph demo` of a flow with panes: each pane has the demo's UI (its panel, rings and captions) on its own page, and
 * the run's voice; on the stage or in windows, Next works as on one page.
 */
export async function splitDemoMode(session: PlaySession, steps: readonly PlayStep[], options: PlayOptions, beat: number): Promise<Mode> {
  const voice = voiceOf(session.page);
  if (voice?.steps) voice.prepare(steps.map((s) => s.block.description ?? ""));
  const steppers = new Map<Page, Promise<Stepper>>();
  /** The UI of the pane step `index` acts in, made when the pane first acts. */
  const stepperFor = async (index: number): Promise<Stepper> => {
    const page = await stepPage(steps[index]!.block, session.page, session.mem);
    let stepper = steppers.get(page);
    if (!stepper) {
      stepper = createStepper(page, session.mem, steps, { title: options.title, fastBlocks: options.fastBlocks, beat });
      steppers.set(page, stepper);
    }
    return stepper;
  };
  /** One stepper panel for the whole flow: the pane acting shows it, the others' are put away. */
  let showing: Page | undefined;
  const sharePanel = async (page: Page) => {
    if (showing === page) return;
    const was = showing;
    showing = page;
    await was?.evaluate(() => { const p = window.__wgById?.("wg-panel"); if (p) p.style.display = "none"; }).catch(() => undefined);
    await page.evaluate(() => { const p = window.__wgById?.("wg-panel"); if (p) p.style.display = ""; }).catch(() => undefined);
  };
  return {
    name: "demo",
    // A reset closes the panes; the next episode opens its own, with their own UI.
    afterReset: async () => steppers.clear(),
    before: async (index) => {
      const stepper = await stepperFor(index);
      await sharePanel(await stepPage(steps[index]!.block, session.page, session.mem));
      return stepper.before(index);
    },
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
