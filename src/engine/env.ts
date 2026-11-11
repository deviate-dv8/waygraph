// Every WAYGRAPH_* variable waygraph reads, in one place: what it means and how it is read. The CLI writes most of them
// from flags (cli/flags.ts) and the config file (runtime/waygraph-config.ts) so the runner child it spawns inherits them; the
// rest are environment-only knobs. Nothing else touches process.env.WAYGRAPH_* (check:structure enforces it).

export const WAYGRAPH_ENV = {
  WAYGRAPH_BASE_URL: "Base URL for relative gotos (--base-url, the config's baseUrl)",
  WAYGRAPH_CONFIG: "Which config file to load (--config <name|file>)",
  WAYGRAPH_ENV: "Env mode: loads .env.<mode> on top of .env (--env)",
  WAYGRAPH_COMMAND: "The command running (run / demo / test), so the config's per-command section applies",
  WAYGRAPH_PROJECT_DIR: "The project a command works on when it runs as its own process: waygraph test's Playwright, waygraph ui's server",
  WAYGRAPH_HEADED: "1 shows the browser, 0 hides it (--non-headless; demo default 1)",
  WAYGRAPH_STEP: "1 plays steps through the demo stepper (demo, run --step)",
  WAYGRAPH_JSON: "1 prints a JSON report instead of the demo log",
  WAYGRAPH_ALL_BRANCHES: "1 explores every branch() path (--all-branches)",
  WAYGRAPH_SHARED_SESSION: "1 keeps one session across branches (--shared-session)",
  WAYGRAPH_TITLE: "Demo banner title (--title)",
  WAYGRAPH_TITLE_POS: "Demo banner position: left | center | right",
  WAYGRAPH_DATA: "Mem seed JSON (--data)",
  WAYGRAPH_MEM_STUB: "1 fills missing requires from registerMemStub (--mem-stub)",
  WAYGRAPH_NO_EXPECT: "1 skips every Block's and step's expectations: verify only (--no-expect)",
  WAYGRAPH_REPLAY: "A run id: seed mem with what that run recorded (--replay)",
  WAYGRAPH_FLOW_TESTS: "1 makes waygraph test run every flow as a test (--flows)",
  WAYGRAPH_INPUT: "A flow's input: JSON or @file; an array plays the flow once per item (--input)",
  WAYGRAPH_AUTOPLAY: "1 advances demo steps on their own (--auto-next)",
  WAYGRAPH_AUTOPLAY_MS: "Auto-next wait per step, ms (default 1800)",
  WAYGRAPH_DEMO_FAST: "1 shortens the demo's gates (--fast)",
  WAYGRAPH_DEMO_PACE: "Default pace for every demo step (the config's demo.pace)",
  WAYGRAPH_PACE_SPEEDS: "JSON of pace multipliers, e.g. {\"fast\":0.5}",
  WAYGRAPH_FAST_BLOCKS: "Comma-separated Block names that skip the demo's added dwell",
  WAYGRAPH_COMPARE: "Play the flow twice side by side and say where they differ: as=a,b | device=a,b | config=a,b (--compare)",
  WAYGRAPH_SPLIT: "How a flow with panes is shown in a demo or video: stage (side by side in one window, the default) or windows (--split)",
  WAYGRAPH_VIDEO_PANES: "1 also records each pane of a flow with panes, at full frame rate (--video-panes)",
  WAYGRAPH_SLOWMO: "Playwright slowMo / the demo's beat after each action, ms",
  WAYGRAPH_TYPING_MS: "Demo typing delay per character, ms (default 30)",
  WAYGRAPH_APPEARANCE: "The overlay's appearance: light | dark (default: the system's)",
  WAYGRAPH_SWIPE_MS: "Demo swipe gesture duration, ms (default 650)",
  WAYGRAPH_DEVICE_TRANSITION_MS: "Demo device resize animation, ms (default 520)",
  WAYGRAPH_STEPPER: "full shows every step chip (--full); default carousel",
  WAYGRAPH_MINI: "1 forces the compact stepper panel (--mini)",
  WAYGRAPH_TODO_POS: "Todo dock side: left | right (--todo-left / --todo-right)",
  WAYGRAPH_TODO_UI: "full turns off the todo dock's compact / collision / behind-ring (--todo-full)",
  WAYGRAPH_TODO_COLLISION: "0 turns off the todo dock moving away from a ring",
  WAYGRAPH_TODO_BEHIND: "0 turns off dimming the todo dock behind a ring",
  WAYGRAPH_TODO_COMPACT: "0 turns off folding long todo lists",
  WAYGRAPH_TODO_CAP: "Rows a folded todo list shows (default 5)",
  WAYGRAPH_TODO_EXPAND_CAP: "Rows a hovered todo list shows (default 14)",
  WAYGRAPH_FF_EXPAND: "1 plays fast-forward units step by step (--ff-expand)",
  WAYGRAPH_FF_DISABLED: "1 expands fast-forward units and keeps their blitz pace (--ff-disabled)",
  WAYGRAPH_CLEAR_SESSION: "1 clears the session before every step after the first",
  WAYGRAPH_VIDEO: "Record a video: the folder, or 1 for the default (--video)",
  WAYGRAPH_OVERLAY_HIDE: "The parts of the demo overlay to leave out, comma-separated: banner, panel, checks, todos (the config's demo.overlay)",
  WAYGRAPH_OVERLAY_TRACE: "1 logs each piece of the demo overlay showing and going, and how often each blinked",
  WAYGRAPH_DEVICE: "The device run and demo start their browser as: a name or its parts, as JSON (the config's device)",
  WAYGRAPH_VOICE: "0 records a demo without the config's voice-over (--no-voice)",
  WAYGRAPH_VIDEO_DIR: "Default video folder",
  WAYGRAPH_VIDEO_VIEWPORT: "Recording size, e.g. 1920x1080 (--video-viewport)",
  WAYGRAPH_RUN_LOG: "Run log: 0 turns it off, or a folder (the config's runLog)",
  WAYGRAPH_SESSIONS: "Where accounts with a ttl save their sessions for later runs (default .waygraph/sessions); 0 turns saving off",
  WAYGRAPH_FRESH_SESSIONS: "1 signs every account in again, ignoring saved sessions, and saves the new ones (--fresh-sessions)",
  WAYGRAPH_EXTENSIONS: "Unpacked browser extension folders, path-separated (overrides the config's extensions)",
  WAYGRAPH_CACHE_DIR: "Where downloaded extensions are cached",
  WAYGRAPH_PROVE_SHOT: "Demo self-check: screenshot path for the overlay proof",
  WAYGRAPH_PROVE_EXIT: "1 exits after the first overlay proof (demo self-check)",
  WAYGRAPH_PROVE_EVERY: "1 proves the overlay on every step, not only the first",
} as const;

export type WaygraphEnvName = keyof typeof WAYGRAPH_ENV;

/** The raw value, or undefined when unset. */
export function envString(name: WaygraphEnvName): string | undefined {
  return process.env[name];
}

/** On / off: 1 / true / yes / on, or 0 / false / no / off; `fallback` when unset or anything else. */
export function envSwitch(name: WaygraphEnvName, fallback: boolean): boolean {
  const v = (process.env[name] ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

/** True only when switched on. */
export function envFlag(name: WaygraphEnvName): boolean {
  return envSwitch(name, false);
}

/** The value as a number, or undefined when unset or not a number. */
export function envNumber(name: WaygraphEnvName): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Sets a variable (for the runner child the CLI spawns); undefined unsets it. */
export function setEnv(name: WaygraphEnvName, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
