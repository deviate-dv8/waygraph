// Writes every run event to `<dir>/<runId>.jsonl` when WAYGRAPH_RUN_LOG names a folder (the CLI sets it to the project's
// `.waygraph/runs`; `runLog: false` in the config turns it off). This is the run history Waygraph UI reads.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { onRunEvent, type RunEvent } from "../engine/run/events.js";
import { envFlag, envString } from "../engine/env.js";

let installed = false;

/** Starts writing run events to the run log. Called by the package entry and the runner; a second call does nothing. */
export function installRunLog(): void {
  if (installed) return;
  installed = true;
  onRunEvent((event) => {
    const dir = envString("WAYGRAPH_RUN_LOG");
    if (!dir || dir === "0") return;
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${event.runId}.jsonl`);
    appendFileSync(file, JSON.stringify(event) + "\n");
    // Where a tool finds the run's result as data (each step, a failed check's wanted / saw), instead of reading output.
    // On stdout, next to "chain finished" (a clean run keeps stderr empty); JSON mode's stdout is the report alone.
    if (event.type === "run:end" && !envFlag("WAYGRAPH_JSON")) console.log(`waygraph: run log ${file}`);
  });
}

/** The folder run logs go to for a project unless the config or the environment says otherwise. */
export function defaultRunLogDir(projectDir: string): string {
  return join(projectDir, ".waygraph", "runs");
}

/** A recorded run's events, from the project's run log (where WAYGRAPH_RUN_LOG points, else the default folder). */
export function readRunLog(projectDir: string, runId: string): RunEvent[] {
  const dir = envString("WAYGRAPH_RUN_LOG");
  const file = join(dir && dir !== "0" ? dir : defaultRunLogDir(projectDir), `${runId.replace(/\.jsonl$/, "")}.jsonl`);
  if (!existsSync(file)) throw new Error(`waygraph: no run log for "${runId}" (looked for ${file})`);
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as RunEvent);
}
