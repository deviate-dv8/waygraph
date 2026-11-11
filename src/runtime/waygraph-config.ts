// waygraph.config.* - new, additive, optional. package.json's own "waygraph" field (baseUrl)
// keeps working untouched; this is a second, richer place to put the same kind of project-level
// setting, for consumers who'd rather have a real typed file than a JSON field. Real ask: "I
// think its time to add waygraph config now."
import { messageOf } from "../engine/errors.js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { extensionPathsFromEnv } from "./browser.js";
import type { PlaywrightTestConfig } from "@playwright/test";
import { envMode, loadEnvFiles } from "./env-file.js";
import { resolveExtensions } from "./extensions.js";
import type { ExtensionSpec } from "../engine/config.js";
import type { WebServerConfig } from "./webserver.js";
import type { DemoPace } from "../engine/stub/pace.js";
import { envString, setEnv } from "../engine/env.js";
import type { WaygraphEnvName } from "../engine/env.js";
import { takeGlobalFlag } from "./global-flag.js";
import type { Voice } from "./voice.js";
import type { Device } from "../engine/flow/device.js";

/** Where `--video` recordings are saved and at what size. */
export interface VideoSettings {
  /** Where recordings are saved: absolute, `~/…`, or relative to the project. Default `~/Downloads/waygraph-videos/<project>` (the project's `.waygraph-videos/` where there is no Downloads folder, and on CI). */
  dir?: string;
  /** Recording size, e.g. `"1920x1080"` (demo default) or `"1280x720"` (run default). */
  viewport?: string;
}

/** Settings `waygraph run` and `waygraph demo` share. */
export interface RunSettings {
  /** Show the browser window. */
  headed?: boolean;
  /**
   * `run`: Playwright's `slowMo`, ms before every operation. `demo`: waygraph's own pause after each action (default 350),
   * applied once per action rather than per keystroke, and removed by a step's `pace: "blitz"`.
   */
  slowMo?: number;
  video?: VideoSettings;
}

/** Settings for `waygraph demo`. */
export interface DemoSettings extends RunSettings {
  /** Default pace for flows and steps that set none: `"fast"`, `"slow"`, `"blitz"`, or a multiplier like `0.5` / `2`. Narration gates and dwell scale with it; `"blitz"` also skips typing animation. */
  pace?: DemoPace;
  /**
   * What the named paces mean, as multipliers of normal dwell and gate time (1 = normal): blitz 0.05, fast 0.33, slow 2 by
   * default. Lower is faster. `blitz` also skips the cursor, ring pops and typing animation.
   * @example speeds: { fast: 0.5, blitz: 0.1 }
   */
  speeds?: { blitz?: number; fast?: number; slow?: number };
  /** Typing animation: ms per character (default 30). `0` types instantly. */
  typingMs?: number;
  /** Advance steps automatically instead of waiting for Next. */
  autoNext?: boolean;
  /** Shorter Next / auto-next gates; keeps the cursor and typing animation. */
  fast?: boolean;
  /** The overlay in light or dark; by default it follows the system's setting. Pin one so every recording matches. */
  appearance?: "light" | "dark";
  /**
   * A voice-over for recorded demos (`--video`): each caption and slide is spoken by `speaker`, timed to the recording,
   * and the video gets it as its audio track (ffmpeg), with subtitles beside it (`.vtt`). `steps: true` also speaks each
   * step's description. `--no-voice` records without it.
   * @example voice: { speaker: commandVoice("piper --model en_US-amy-medium.onnx --output_file {out}"), steps: true }
   */
  voice?: VoiceSettings;
  /**
   * Which parts of waygraph's overlay a demo shows (each is on unless set to `false`). The cursor, the typing and the
   * captions always show: `{ banner: false, panel: false, checks: false }` is a demo of just the app, the mouse, the
   * keyboard and what the captions say.
   */
  overlay?: OverlaySettings;
}

/** The parts of a demo's overlay that can be left out. */
export interface OverlaySettings {
  /** The title at the top. */
  banner?: boolean;
  /** The step panel (the step, Next, the progress). Without it the demo moves on by itself, slides show as captions, and a failed step still shows its panel. */
  panel?: boolean;
  /** What each step checked: the rings on the elements its checks looked at, and the card of what was expected and what the page now shows. */
  checks?: boolean;
  /** The checklist docks (`ctx.ui.todos`). */
  todos?: boolean;
}

/** A recorded demo's voice-over: who speaks, and whether each step's description is spoken too. */
export interface VoiceSettings {
  speaker: Voice;
  steps?: boolean;
}

/** The project config in `config/waygraph.config.ts`: base URL, extensions, run and demo settings, web server and the Playwright block. */
export interface WaygraphConfig {
  /** Same value `resolveBaseUrl` would otherwise read from package.json's `waygraph.baseUrl`. */
  baseUrl?: string;
  /** Chromium extensions to load in every run: `"hoppscotch"`, a Chrome Web Store id, or `{ path }` to an unpacked one. */
  extensions?: ExtensionSpec[];
  /** Recording with `--video` (`waygraph run` / `demo`); `run` and `demo` below can override it. */
  video?: VideoSettings;
  /**
   * The device flows play on: `"desktop"` (the default), `"tablet"`, `"mobile"`, or its parts (`{ preset: "mobile",
   * orientation: "landscape" }`, `{ width: 1600, height: 900 }`). `run`, `demo` and `waygraph test` start their browser
   * as it (its size, phone layout and touch); a flow's `map({ device })` changes the size for that flow.
   */
  device?: Device;
  /** Default for `run` and `demo`: milliseconds to pause around each browser action, so a run is watchable. */
  slowMo?: number;
  /** Default for `run` and `demo`: show the browser window. Without it `demo` and `auto` are headed and `run` is headless. */
  headed?: boolean;
  /** Settings for `waygraph run` only. They override the shared ones above. */
  run?: RunSettings;
  /** Settings for `waygraph demo` only. They override the shared ones above. */
  demo?: DemoSettings;
  /** Write each run's events to `.waygraph/runs/<runId>.jsonl` (the history Waygraph Studio shows), or to this folder. Default true. */
  runLog?: boolean | string;
  /**
   * Labels for flows, to run a group of them (`waygraph test --flows --label auth`): each label names its flows, by a
   * glob over their files (`"src/flows/auth/**"`) or by a flow's export name (`"loginFlow"`). A flow can have several.
   * @example labels: { auth: ["src/flows/auth/**", "logoutFlow"], smoke: ["loginFlow", "checkoutFlow"] }
   */
  labels?: Record<string, string[]>;
  /** Folder of test files, relative to the project. Default `"tests"`. */
  testDir?: string;
  /** App to start around `waygraph test`, `run`, `demo` and `auto` (same fields as Playwright's `webServer`). */
  webServer?: WebServerConfig | WebServerConfig[];
  /** Anything else for the test runner, e.g. `workers`, `timeout`, `reporter`, `use: { video: "on" }`. Merged over waygraph's defaults. */
  playwright?: PlaywrightTestConfig;
}

/** What a config function receives: the env mode and the environment with `.env` files already loaded. */
export interface ConfigContext {
  mode: string;
  env: Record<string, string | undefined>;
}

/**
 * Typed identity helper, like `defineConfig` in `vite.config.ts`. Pass an object, or a function when values come
 * from `.env` files (`.env`, `.env.local`, `.env.<mode>`; pick the mode with `--env <mode>`):
 * @example export default defineConfig(({ env }) => ({ baseUrl: env.BASE_URL }))
 */
export function defineConfig(config: WaygraphConfig | ((context: ConfigContext) => WaygraphConfig)): WaygraphConfig {
  if (typeof config !== "function") return config;
  loadEnvFiles(process.cwd());
  return config({ mode: envMode(), env: process.env });
}

const CONFIG_NAMES = ["waygraph.config.ts", "waygraph.config.mts", "waygraph.config.mjs", "waygraph.config.js", "waygraph.config.cjs"];
/** `config/` first, then the project root. */
const CONFIG_FILENAMES = [...CONFIG_NAMES.map((n) => join("config", n)), ...CONFIG_NAMES];

/**
 * The waygraph project `start` is in: the nearest folder, `start` or above, with a `waygraph.config.*` (in it or its
 * `config/`) or a package.json that depends on waygraph. Null when there is none up to the filesystem root.
 */
export function findProjectDir(start: string): string | null {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    if (CONFIG_FILENAMES.some((name) => existsSync(join(dir, name))) || dependsOnWaygraph(dir)) return dir;
    if (dirname(dir) === dir) return null;
  }
}

function dependsOnWaygraph(dir: string): boolean {
  const file = join(dir, "package.json");
  if (!existsSync(file)) return false;
  try {
    const pkg = JSON.parse(readFileSync(file, "utf8")) as { dependencies?: object; devDependencies?: object };
    return "waygraph" in (pkg.dependencies ?? {}) || "waygraph" in (pkg.devDependencies ?? {});
  } catch {
    // Not valid JSON: not a project waygraph can read either.
    return false;
  }
}

/**
 * Which config file(s) to try. `--config <file>` / `WAYGRAPH_CONFIG` picks one: a path (`config/staging.ts`), or a short name
 * (`staging` -> `config/waygraph.staging.config.ts`, also tried in the project root). Without it, `waygraph.config.*`.
 */
function configCandidates(chosen = envString("WAYGRAPH_CONFIG")): string[] {
  if (!chosen) return CONFIG_FILENAMES;
  if (/[\\/]/.test(chosen) || /\.[cm]?[jt]s$/.test(chosen)) return [chosen];
  const names = ["ts", "mts", "mjs", "js", "cjs"].map((e) => `waygraph.${chosen}.config.${e}`);
  return [...names.map((n) => join("config", n)), ...names, chosen];
}

/** Removes `--config <file>` / `--config=<file>` from argv and records it as `WAYGRAPH_CONFIG`, so every command reads that config. */
export function takeConfigFlag(argv: string[]): string[] {
  const { value, rest } = takeGlobalFlag(argv, "config");
  if (value !== undefined) setEnv("WAYGRAPH_CONFIG", value);
  return rest;
}

/**
 * Looks for the first `waygraph.config.*` in `projectDir` and imports it - `.ts` works
 * unmodified because `bin/waygraph` already registers `tsx/esm` before `dist/cli/cli.js` ever runs
 * (the same mechanism that already lets a consumer's `.block.ts`/`.flow.ts` import directly), so
 * no separate loader/transpile step is needed here. A broken config file throws loud, naming the
 * file - silently swallowing it would make a missing `baseUrl` look like "nobody configured
 * anything" instead of "your config file has a bug."
 */
/**
 * Another of the project's configs, by name (`staging`: `config/waygraph.staging.config.ts`), read without setting
 * anything from it: what `--compare config=a,b` compares.
 */
export async function readNamedConfig(projectDir: string, name: string): Promise<WaygraphConfig> {
  for (const file of name === "default" ? CONFIG_FILENAMES : configCandidates(name)) {
    const p = isAbsolute(file) ? file : join(projectDir, file);
    if (!existsSync(p)) continue;
    const mod = (await import(pathToFileURL(p).href)) as { default?: WaygraphConfig } & WaygraphConfig;
    return mod.default ?? mod;
  }
  throw new Error(`waygraph: no config "${name}" (looked for ${configCandidates(name).join(", ")})`);
}

export async function loadWaygraphConfig(projectDir: string): Promise<WaygraphConfig | undefined> {
  loadEnvFiles(projectDir);
  for (const name of configCandidates()) {
    const p = isAbsolute(name) ? name : join(projectDir, name);
    if (!existsSync(p)) {
      if (envString("WAYGRAPH_CONFIG") && name === envString("WAYGRAPH_CONFIG")) {
        throw new Error(`waygraph: config "${envString("WAYGRAPH_CONFIG")}" not found (looked for ${p})`);
      }
      continue;
    }
    let mod: { default?: WaygraphConfig } & WaygraphConfig;
    try {
      mod = (await import(pathToFileURL(p).href)) as { default?: WaygraphConfig } & WaygraphConfig;
    } catch (err) {
      throw new Error(
        `waygraph: failed to load ${name}: ${messageOf(err)}`,
      );
    }
    const loaded = mod.default ?? mod;
    applyConfigEnv(loaded);
    return loaded;
  }
  return undefined;
}

/** The project's config file, the one {@link loadWaygraphConfig} reads (relative to the project); undefined without one. */
export function configFileOf(projectDir: string): string | undefined {
  for (const name of configCandidates()) {
    const p = isAbsolute(name) ? name : join(projectDir, name);
    if (existsSync(p)) return isAbsolute(name) ? p : name;
  }
  return undefined;
}

/** A config as plain JSON, to show it: a function, a pattern or a class instance becomes a word saying what it is. */
export function configAsJson(value: unknown): unknown {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (typeof value === "function") return `(function${value.name ? ` ${value.name}` : ""})`;
  if (value instanceof RegExp) return String(value);
  if (Array.isArray(value)) return value.map(configAsJson);
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, configAsJson(v)]),
    );
  }
  return value === undefined ? null : `(${(value as object).constructor?.name ?? typeof value})`;
}

/** Sets WAYGRAPH_BASE_URL from the project's config / .env, unless a flag or the shell already set it. */
export async function useProjectBaseUrl(projectDir: string): Promise<void> {
  if (envString("WAYGRAPH_BASE_URL")) return;
  const resolved = await resolveBaseUrl(projectDir);
  if (resolved) setEnv("WAYGRAPH_BASE_URL", resolved);
}

/**
 * Single source of truth for a project's base URL. Was three independently drifted copies
 * (`src/cli/flags.ts`, `src/live/traverse/traverse.ts`, `src/live/auto/auto.ts`), each checking
 * a slightly different subset of sources in a different order - real duplication, not just
 * stylistic, since one copy skipped `config.waygraph.*` nesting and another checked
 * `WAYGRAPH_BASE_URL` first instead of last. Checked in this order:
 *
 * 1. `WAYGRAPH_BASE_URL` - a real shell export, or one loaded from a `.env` file (see
 *    `loadEnvFiles`, called here so every caller gets native `.env` support for free, not just
 *    whichever command remembered to call it).
 * 2. A `waygraph.config.*` file's `baseUrl`.
 */
export async function resolveBaseUrl(projectDir: string): Promise<string | undefined> {
  loadEnvFiles(projectDir);
  if (envString("WAYGRAPH_BASE_URL")) return envString("WAYGRAPH_BASE_URL");

  const config = await loadWaygraphConfig(projectDir);
  if (config?.baseUrl && config.baseUrl.trim()) return config.baseUrl.trim();

  return undefined;
}

/** Unpacked extension directories for a run: `WAYGRAPH_EXTENSIONS` if set, else the config file's `extensions` (fetched on first use). */
export async function configuredExtensions(projectDir: string): Promise<string[]> {
  const fromEnv = extensionPathsFromEnv();
  if (fromEnv.length > 0) return fromEnv;
  loadEnvFiles(projectDir);
  return resolveExtensions((await loadWaygraphConfig(projectDir))?.extensions, projectDir);
}

/**
 * Applies the config's run settings as the `WAYGRAPH_*` variables the runner reads, for the command being run
 * (`WAYGRAPH_COMMAND`, set by the CLI). The `run` / `demo` section overrides the shared top-level values. A flag, a shell
 * variable or a `.env` value that is already set always wins, so the config only supplies defaults.
 */
export function applyConfigEnv(config: WaygraphConfig | undefined, command: string | undefined = envString("WAYGRAPH_COMMAND")): void {
  if (!config) return;
  const isDemo = command === "demo" || command === "try";
  const section: DemoSettings | undefined = isDemo ? config.demo : command === "run" ? config.run : undefined;
  const set = (name: WaygraphEnvName, value: string | undefined): void => {
    if (value !== undefined && envString(name) === undefined) setEnv(name, value);
  };
  const flag = (b: boolean | undefined): string | undefined => (b === undefined ? undefined : b ? "1" : "0");
  const video = { ...config.video, ...section?.video };
  const slowMo = section?.slowMo ?? config.slowMo;
  if (config.runLog === false) set("WAYGRAPH_RUN_LOG", "0");
  else if (typeof config.runLog === "string") set("WAYGRAPH_RUN_LOG", config.runLog);
  set("WAYGRAPH_VIDEO_DIR", video.dir);
  set("WAYGRAPH_VIDEO_VIEWPORT", video.viewport);
  set("WAYGRAPH_SLOWMO", slowMo === undefined ? undefined : String(slowMo));
  set("WAYGRAPH_DEVICE", config.device === undefined ? undefined : JSON.stringify(config.device));
  set("WAYGRAPH_HEADED", flag(section?.headed ?? config.headed));
  if (isDemo) {
    set("WAYGRAPH_AUTOPLAY", flag(config.demo?.autoNext));
    set("WAYGRAPH_DEMO_FAST", config.demo?.fast ? "1" : undefined);
    set("WAYGRAPH_DEMO_PACE", config.demo?.pace === undefined ? undefined : String(config.demo.pace));
    set("WAYGRAPH_PACE_SPEEDS", config.demo?.speeds ? JSON.stringify(config.demo.speeds) : undefined);
    set("WAYGRAPH_TYPING_MS", config.demo?.typingMs === undefined ? undefined : String(config.demo.typingMs));
    set("WAYGRAPH_APPEARANCE", config.demo?.appearance);
    const hidden = Object.entries(config.demo?.overlay ?? {}).filter(([, shown]) => shown === false).map(([part]) => part);
    set("WAYGRAPH_OVERLAY_HIDE", hidden.length ? hidden.join(",") : undefined);
  }
}
