// Writes every run event to `<dir>/<runId>.jsonl` when WAYGRAPH_RUN_LOG names a folder (the CLI sets it to the project's
// `.waygraph/runs`; `runLog: false` in the config turns it off). This is the run history Waygraph UI reads.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { currentStep, onRunEvent, recordArtifact, type RunEvent } from "../engine/run/events.js";
import { keepScreenshots } from "../engine/run/screenshot.js";
import { envFlag, envString } from "../engine/env.js";
import { ignorePageGone } from "../engine/page-gone.js";

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
  // A Block's screenshot (`screenshot: true`): kept with its run (`<runId>/<step>-<block>.png`, recorded as an artifact of
  // that step), and as its page's newest look (`../screenshots/<Checkpoint>.png`, what Waygraph UI's map shows).
  keepScreenshots(async (shot) => {
    const dir = envString("WAYGRAPH_RUN_LOG");
    const step = currentStep();
    if (!dir || dir === "0" || !step) return;
    const file = join(dir, step.runId, `${String(step.index).padStart(2, "0")}-${fileSafe(shot.block)}.png`);
    mkdirSync(join(dir, step.runId), { recursive: true });
    await withoutOverlay(shot.page, () => shot.page.screenshot({ path: file, fullPage: shot.fullPage }));
    const pages = join(dir, "..", "screenshots");
    mkdirSync(pages, { recursive: true });
    copyFileSync(file, join(pages, `${fileSafe(shot.checkpoint)}.png`));
    recordArtifact("screenshot", file, step.runId, { index: step.index, block: shot.block, checkpoint: shot.checkpoint });
  });
}

/** A name as a file name: letters, digits, dots, dashes and underscores. */
function fileSafe(name: string): string {
  return name.replace(/[^\w.-]/g, "_");
}

/** Runs `take` with waygraph's own overlay (the demo's panel, rings, banner) out of the picture. */
async function withoutOverlay<T>(page: Page, take: () => Promise<T>): Promise<T> {
  const hide = (hidden: boolean) =>
    page.evaluate((h) => {
      const root = document.getElementById("wg-root");
      if (root) root.style.visibility = h ? "hidden" : "";
    }, hidden);
  await hide(true);
  try {
    return await take();
  } finally {
    await hide(false).catch(ignorePageGone);
  }
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
