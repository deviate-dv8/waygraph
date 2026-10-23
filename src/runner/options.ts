// How to play, read once from the environment the CLI set (flags beat the config file, which beats these defaults).
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
}

const env = process.env;

function readMode(): ModeName {
  if (env.WAYGRAPH_ALL_BRANCHES === "1") return "branches";
  if (env.WAYGRAPH_JSON === "1") return "report";
  return env.WAYGRAPH_STEP === "1" ? "demo" : "run";
}

export function readOptions(): PlayOptions {
  const mode = readMode();
  return {
    mode,
    // A manual demo is watched, so it is headed by default; WAYGRAPH_HEADED=0 (e.g. --auto-play-video) still wins.
    headed: env.WAYGRAPH_HEADED === "0" ? false : env.WAYGRAPH_HEADED === "1" || mode === "demo",
    baseURL: env.WAYGRAPH_BASE_URL,
    title: env.WAYGRAPH_TITLE,
    fastBlocks: new Set((env.WAYGRAPH_FAST_BLOCKS || "").split(",").map((s) => s.trim()).filter(Boolean)),
    clearSession: env.WAYGRAPH_CLEAR_SESSION === "1",
    video: env.WAYGRAPH_VIDEO,
    videoViewport: env.WAYGRAPH_VIDEO_VIEWPORT,
    ffExpand: env.WAYGRAPH_FF_EXPAND === "1" || env.WAYGRAPH_FF_DISABLED === "1",
    ffDisabled: env.WAYGRAPH_FF_DISABLED === "1",
    memStub: env.WAYGRAPH_MEM_STUB === "1",
    sharedSession: env.WAYGRAPH_SHARED_SESSION === "1",
  };
}

/**
 * The slowMo for the browser launch and the demo's own beat after each action. The demo launches at 0 and paces
 * itself, so a step's pace can remove the beat; a fast-forward unit in the steps drops the beat to 0.
 */
export function slowMoFor(options: PlayOptions, steps: readonly PlayStep[]): { launch: number | undefined; demoBeat: number } {
  const demo = options.mode === "demo";
  const hasFastForward = steps.some((s) => (s.block as { fastForward?: boolean }).fastForward === true || s.wasFastForward === true);
  const slowMo = env.WAYGRAPH_SLOWMO !== undefined ? Number(env.WAYGRAPH_SLOWMO) : demo ? (hasFastForward ? 0 : 350) : undefined;
  if (demo && hasFastForward && env.WAYGRAPH_SLOWMO === undefined) {
    console.error(
      options.ffDisabled
        ? "waygraph demo: --ff-disabled (expanded) -> Playwright slowMo=0 on former FF steps (blitz; same acts as opaque FF)"
        : "waygraph demo: opaque FFCompose in flow -> Playwright slowMo=0 (blitz); set WAYGRAPH_SLOWMO to override",
    );
  }
  return { launch: demo ? 0 : slowMo, demoBeat: slowMo ?? 0 };
}
