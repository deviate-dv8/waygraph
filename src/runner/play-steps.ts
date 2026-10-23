// The one loop every mode plays: each step goes through the engine, with the mode's hooks around it.
import type { Checkpoint } from "../core/types.js";
import { buildFlow } from "../core/flow.js";
import { resetPage } from "./session.js";
import type { Mode, PlayOutcome, PlaySession, PlayStep } from "./mode.js";

/** Where a "retry" goes back to: the first step of this step's episode, or the start of an ad hoc chain. */
function episodeStart(steps: readonly PlayStep[], index: number): number {
  const episode = steps[index]!.episodeNumber;
  return episode === undefined ? 0 : steps.findIndex((s) => s.episodeNumber === episode);
}

/** Runs one Block through the engine, on the session's page, with its own flow's config. */
async function runStep(step: PlayStep, session: PlaySession): Promise<Checkpoint<string>> {
  const flow = buildFlow([step.block], step.config);
  const { result } = await flow.run(session.context, session.mem, { page: session.page, closeOnFinish: false });
  return result;
}

export async function playSteps(steps: readonly PlayStep[], session: PlaySession, mode: Mode, clearSession: boolean): Promise<PlayOutcome> {
  await mode.begin?.(steps);
  let outcome: PlayOutcome = { ok: true };
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    // A segment's --data is seeded when it starts, so two segments can give the same key different values.
    step.seedMem?.();
    if ((clearSession || step.resetSession) && i > 0) {
      await resetPage(session);
      await mode.afterReset?.();
    }
    await mode.before?.(i);

    const startedAt = Date.now();
    let result: Checkpoint<string>;
    try {
      result = await runStep(step, session);
    } catch (error) {
      if ((await mode.failed?.(i, { error }, Date.now() - startedAt)) === "retry") {
        await resetPage(session);
        await mode.afterReset?.();
        i = episodeStart(steps, i) - 1;
        continue;
      }
      outcome = step.expectedFailureReason
        ? { ok: true, expectedFailure: { step, reason: step.expectedFailureReason } }
        : { ok: false, failedAt: { index: i, step, error } };
      break;
    }
    outcome = { ok: true, result };

    // A flow meant to fail can also end on its failure branch without throwing (a login that stays on the login page).
    if (step.expectedFailureReason) {
      if ((await mode.failed?.(i, { result }, Date.now() - startedAt)) === "retry") {
        await resetPage(session);
        await mode.afterReset?.();
        i = episodeStart(steps, i) - 1;
        continue;
      }
      outcome = { ok: true, result, expectedFailure: { step, reason: step.expectedFailureReason } };
      break;
    }
    await mode.after?.(i, result, Date.now() - startedAt);
  }
  await mode.end?.(outcome);
  return outcome;
}
