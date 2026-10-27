// How to play, read once from the environment the CLI set (flags beat the config file, which beats these defaults).
import { envFlag, envNumber, envString, envSwitch } from "../engine/env.js";
import type { PlayStep } from "./mode.js";

export type ModeName = "run" | "demo" | "report" | "branches";

export interface PlayOptions {
  mode: ModeName;
  headed: boolean;
  baseURL: string | undefined;
  title: string | undefined;
  /** Block names that skip the demo's added dwell (WAYGRAPH_FAST_BLOCKS). */
  fastBlocks: Set<string>;
  /** Clear the session before every step after the first (WAYGRAPH_CLEAR_SESSION). */
  clearSession: boolean;
  /** Record a video: the folder, or "1" for the default one. */
  video: string | undefined;
  videoViewport: string | undefined;
  /** Expand fast-forward units into their inner steps (--ff-expand / --ff-disabled). */
  ffExpand: boolean;
  ffDisabled: boolean;
  /** Fill missing `requires` from registerMemStub for every flow (--mem-stub). */
  memStub: boolean;
  /** --all-branches without cloning the session per branch. */
  sharedSession: boolean;
  /** A run id whose recorded mem each segment is seeded with instead (--replay). */
  replay: string | undefined;
  /** The flow's input, JSON or @file (--input). */
  input: string | undefined;
}


function readMode(): ModeName {
  if (envFlag("WAYGRAPH_ALL_BRANCHES")) return "branches";
  if (envFlag("WAYGRAPH_JSON")) return "report";
  return envFlag("WAYGRAPH_STEP") ? "demo" : "run";
}

export function readOptions(): PlayOptions {
  const mode = readMode();
  return {
    mode,
    // A manual demo is watched, so it is headed by default; WAYGRAPH_HEADED=0 (e.g. --auto-play-video) still wins.
    headed: envSwitch("WAYGRAPH_HEADED", mode === "demo"),
    baseURL: envString("WAYGRAPH_BASE_URL"),
    title: envString("WAYGRAPH_TITLE"),
    fastBlocks: new Set((envString("WAYGRAPH_FAST_BLOCKS") || "").split(",").map((s) => s.trim()).filter(Boolean)),
    clearSession: envFlag("WAYGRAPH_CLEAR_SESSION"),
    video: envString("WAYGRAPH_VIDEO"),
    videoViewport: envString("WAYGRAPH_VIDEO_VIEWPORT"),
    ffExpand: envFlag("WAYGRAPH_FF_EXPAND") || envFlag("WAYGRAPH_FF_DISABLED"),
    ffDisabled: envFlag("WAYGRAPH_FF_DISABLED"),
    memStub: envFlag("WAYGRAPH_MEM_STUB"),
    sharedSession: envFlag("WAYGRAPH_SHARED_SESSION"),
    replay: envString("WAYGRAPH_REPLAY"),
    input: envString("WAYGRAPH_INPUT"),
  };
}

/**
 * The slowMo for the browser launch and the demo's own beat after each action. The demo launches at 0 and paces
 * itself, so a step's pace can remove the beat; a fast-forward unit in the steps drops the beat to 0.
 */
export function slowMoFor(options: PlayOptions, steps: readonly PlayStep[]): { launch: number | undefined; demoBeat: number } {
  const demo = options.mode === "demo";
  const hasFastForward = steps.some((s) => (s.block as { fastForward?: boolean }).fastForward === true || s.wasFastForward === true);
  const slowMo = envNumber("WAYGRAPH_SLOWMO") ?? (demo ? (hasFastForward ? 0 : 350) : undefined);
  if (demo && hasFastForward && envNumber("WAYGRAPH_SLOWMO") === undefined) {
    console.error(
      options.ffDisabled
        ? "waygraph demo: --ff-disabled (expanded) -> Playwright slowMo=0 on former FF steps (blitz; same acts as opaque FF)"
        : "waygraph demo: opaque FFCompose in flow -> Playwright slowMo=0 (blitz); set WAYGRAPH_SLOWMO to override",
    );
  }
  return { launch: demo ? 0 : slowMo, demoBeat: slowMo ?? 0 };
}
