// `waygraph run`: the steps play like a Playwright test - no UI, no pauses; a failure stops the run.
import type { Mode } from "../mode.js";

export function runMode(): Mode {
  return { name: "run" };
}
