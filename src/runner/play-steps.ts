// The one loop every mode plays: each step goes through the engine, with the mode's hooks around it.
import { Start, type Checkpoint } from "../engine/checkpoint/checkpoint.js";
import { buildFlow } from "../engine/flow/flow.js";
import { closePanes } from "../engine/run/pane-page.js";
import { resetPage } from "./session.js";
import type { Mode, PlayOutcome, PlaySession, PlayStep } from "./mode.js";

/** Where a "retry" goes back to: the first step of this step's episode, or the start of an ad hoc chain. */
function episodeStart(steps: readonly PlayStep[], index: number): number {
  const episode = steps[index]!.episodeNumber;
  return episode === undefined ? 0 : steps.findIndex((s) => s.episodeNumber === episode);
}

/** Runs one Block through the engine, on the session's page, with its own flow's config, from where the last step landed. */
async function runStep(step: PlayStep, session: PlaySession, from: Checkpoint<string>): Promise<Checkpoint<string>> {
  const flow = buildFlow([step.block], step.config);
  // The flow's panes stay open between its steps; they close when the run resets or ends.
  const { result } = await flow.run(session.context, session.mem, { page: session.page, closeOnFinish: false, from, keepPanes: true });
  return result;
}

export async function playSteps(steps: readonly PlayStep[], session: PlaySession, mode: Mode, clearSession: boolean): Promise<PlayOutcome> {
  await mode.begin?.(steps);
  let outcome: PlayOutcome = { ok: true };
  // Where the last step landed: the next step's input. Back to Start whenever the session is reset.
  let at: Checkpoint<string> = Start;
  const cleanupFailures: { step: PlayStep; error: unknown }[] = [];
  /** A cleanup step: played like any other, but a failure is reported and the run goes on. */
  const cleanUp = async (i: number): Promise<void> => {
    const step = steps[i]!;
    await mode.before?.(i);
    const startedAt = Date.now();
    try {
      // Not inside mode.after?.(...): an optional call that isn't made never evaluates its arguments.
      const result = await runStep(step, session, at);
      await mode.after?.(i, result, Date.now() - startedAt);
    } catch (error) {
      cleanupFailures.push({ step, error });
      console.error(`waygraph: cleanup "${step.block.name}" failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    }
  };
  /** The run stops at step i: its flow's cleanup still plays. */
  const cleanUpAfter = async (i: number): Promise<void> => {
    for (let j = i + 1; j < steps.length; j++) if (steps[j]!.cleanup && steps[j]!.segment === steps[i]!.segment) await cleanUp(j);
  };
  // The first failure a mode played on past (a compared side that failed while the other went on): the run's outcome.
  let failedOn: PlayOutcome["failedAt"];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (mode.skip?.(i)) continue;
    if (step.cleanup) {
      await cleanUp(i);
      continue;
    }
    // A segment's --data is seeded when it starts, so two segments can give the same key different values.
    step.seedMem?.();
    if (step.viewport) await session.page.setViewportSize(step.viewport);
    if ((clearSession || step.resetSession) && i > 0) {
      await resetPage(session);
      await mode.afterReset?.();
      at = Start;
    }
    await mode.before?.(i);

    const startedAt = Date.now();
    let result: Checkpoint<string>;
    try {
      result = await runStep(step, session, at);
    } catch (error) {
      const next = await mode.failed?.(i, { error }, Date.now() - startedAt);
      if (next === "continue") {
        failedOn ??= { index: i, step, error };
        continue;
      }
      if (next === "retry") {
        await resetPage(session);
        await mode.afterReset?.();
        at = Start;
        i = episodeStart(steps, i) - 1;
        continue;
      }
      outcome = step.expectedFailureReason
        ? { ok: true, expectedFailure: { step, reason: step.expectedFailureReason } }
        : { ok: false, failedAt: { index: i, step, error } };
      await cleanUpAfter(i);
      break;
    }
    outcome = { ok: true, result };
    at = result;

    // A flow meant to fail can also end on its failure branch without throwing (a login that stays on the login page).
    if (step.expectedFailureReason) {
      if ((await mode.failed?.(i, { result }, Date.now() - startedAt)) === "retry") {
        await resetPage(session);
        await mode.afterReset?.();
        at = Start;
        i = episodeStart(steps, i) - 1;
        continue;
      }
      outcome = { ok: true, result, expectedFailure: { step, reason: step.expectedFailureReason } };
      await cleanUpAfter(i);
      break;
    }
    await mode.after?.(i, result, Date.now() - startedAt);
  }
  if (failedOn && outcome.ok) outcome = { ok: false, failedAt: failedOn };
  if (cleanupFailures.length) outcome = { ...outcome, cleanupFailures };
  await closePanes(session.page);
  await mode.end?.(outcome);
  return outcome;
}
