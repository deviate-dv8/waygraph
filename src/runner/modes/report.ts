// `waygraph run` with WAYGRAPH_JSON=1: plays like `run` and prints one JSON report (each step's Checkpoint and time,
// a screenshot on failure). `runId` names the matching `.waygraph/runs/<runId>.jsonl`.
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Checkpoint } from "../../engine/checkpoint/checkpoint.js";
import { currentRunId, recordArtifact } from "../../engine/run/events.js";
import type { Mode, PlaySession, PlayStep } from "../mode.js";

interface StepReport {
  name: string;
  checkpoint?: Checkpoint<string>;
  expectedFailure?: true;
  error?: string;
  ms: number;
}

export function reportMode(session: PlaySession): Mode {
  let steps: readonly PlayStep[] = [];
  const done: StepReport[] = [];
  let screenshot: string | null = null;
  const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
  return {
    name: "report",
    async begin(all) {
      steps = all;
    },
    async after(index, result, ms) {
      done.push({ name: steps[index]!.block.name, checkpoint: result, ms });
    },
    async failed(index, failure, ms) {
      const step = steps[index]!;
      if (failure.result) {
        done.push({ name: step.block.name, checkpoint: failure.result, ms });
      } else if (step.expectedFailureReason) {
        done.push({ name: step.block.name, expectedFailure: true, error: message(failure.error), ms });
      } else {
        screenshot = join(tmpdir(), "waygraph-chain-failure-" + Date.now() + ".png");
        await session.page.screenshot({ path: screenshot, fullPage: true }).then(
          () => recordArtifact("screenshot", screenshot!),
          () => (screenshot = null),
        );
      }
      return "stop";
    },
    async end(outcome) {
      const runId = currentRunId();
      const report = outcome.failedAt
        ? {
            runId,
            ok: false,
            failedAt: outcome.failedAt.step.block.name,
            stepIndex: outcome.failedAt.index,
            totalSteps: steps.length,
            error: message(outcome.failedAt.error),
            steps: done,
            screenshot,
          }
        : outcome.expectedFailure && outcome.result === undefined
          ? { runId, ok: true, expectedFailure: true, failedAt: outcome.expectedFailure.step.block.name, reason: outcome.expectedFailure.reason, steps: done }
          : { runId, ok: true, result: done.length > 0 ? done[done.length - 1]!.checkpoint : null, steps: done };
      console.log(JSON.stringify(report, null, 2));
      if (!report.ok) process.exitCode = 1;
    },
  };
}
