// How `waygraph run` and `waygraph demo` play a flow. The CLI spawns this inside the project (so the project's own
// Playwright is used) with the project dir and the spec ("cartFlow", "loginFlow then add-item"). Every mode plays the
// same steps through the same engine; the mode decides what happens around each step.
import { MemPage } from "../core/mem-page.js";
import { beginRun, endRun } from "../core/events.js";
import { withWebServer } from "../runtime/webserver.js";
import "../runtime/run-log.js";
import { planSteps } from "./plan/plan.js";
import { readOptions, slowMoFor } from "./options.js";
import { openSession } from "./session.js";
import { playSteps } from "./play-steps.js";
import { playBranches } from "./modes/branches.js";
import { runMode } from "./modes/run.js";
import { demoMode } from "./modes/demo.js";
import { reportMode } from "./modes/report.js";
import type { Mode, PlayOutcome, PlaySession, PlayStep } from "./mode.js";
import type { PlayOptions } from "./options.js";

export async function play(projectDir: string, spec: string): Promise<void> {
  const options = readOptions();
  const mem = new MemPage();
  const { steps, flows } = await planSteps(projectDir, spec, mem, options);
  if (options.mode === "branches") return playBranches(flows, mem, options);

  const slowMo = slowMoFor(options, steps);
  const { session, close } = await openSession(projectDir, options, mem, slowMo.launch);
  let outcome: PlayOutcome;
  try {
    const mode = await pickMode(options, session, steps, slowMo.demoBeat);
    outcome = await playSteps(steps, session, mode, options.clearSession);
  } finally {
    await close();
  }
  if (options.mode !== "report") finish(outcome);
}

function pickMode(options: PlayOptions, session: PlaySession, steps: readonly PlayStep[], demoBeat: number): Mode | Promise<Mode> {
  if (options.mode === "demo") return demoMode(session, steps, options, demoBeat);
  if (options.mode === "report") return reportMode(session);
  return runMode();
}

function finish(outcome: PlayOutcome): void {
  if (outcome.failedAt) throw outcome.failedAt.error;
  if (outcome.expectedFailure) {
    const { step, reason } = outcome.expectedFailure;
    console.log(`waygraph: chain finished (expected failure on ${step.block.name}) -- ${reason}`);
  } else {
    console.log("waygraph: chain finished -- " + JSON.stringify(outcome.result));
  }
}

/** The process entry the CLI's bootstrap calls: one run (and one run log) per invocation. */
export function startRunner(): void {
  const projectDir = process.argv[2] ?? process.cwd();
  const spec = process.argv[3] ?? "";
  const opened = beginRun(spec);
  withWebServer(projectDir, () => play(projectDir, spec))
    .then(
      () => endRun(opened, {}),
      (err) => {
        endRun(opened, { error: err });
        console.error(err && err.stack ? err.stack : String(err));
        process.exitCode = 1;
      },
    );
}
