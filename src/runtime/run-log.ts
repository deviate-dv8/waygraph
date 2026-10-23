// Writes every run event to `<dir>/<runId>.jsonl` when WAYGRAPH_RUN_LOG names a folder (the CLI sets it to the project's
// `.waygraph/runs`; `runLog: false` in the config turns it off). This is the run history Waygraph UI reads.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { onRunEvent } from "../engine/run/events.js";
import { envString } from "../engine/env.js";

onRunEvent((event) => {
  const dir = envString("WAYGRAPH_RUN_LOG");
  if (!dir || dir === "0") return;
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, `${event.runId}.jsonl`), JSON.stringify(event) + "\n");
});

/** The folder run logs go to for a project unless the config or the environment says otherwise. */
export function defaultRunLogDir(projectDir: string): string {
  return join(projectDir, ".waygraph", "runs");
}
