import { basename, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { walkDir } from "../manifest/scan.js";
import { exportedNames, parseSource } from "../manifest/source.js";
import { loadWaygraphConfig, resolveBaseUrl } from "../runtime/config.js";
import { envFlag, envString, setEnv } from "../engine/env.js";

// ---------------------------------------------------------------------------
// CLI plumbing - run flags (flags beat WAYGRAPH_* env)
// ---------------------------------------------------------------------------

interface RunFlags {
  step?: boolean;
  autoplay?: boolean;
  /** demo only: --auto-next + --video (+ step). */
  autoPlayVideo?: boolean;
  /** run/demo: show browser (WAYGRAPH_HEADED=1). */
  nonHeadless?: boolean;
  baseUrl?: string;
  title?: string;
  /** Set when --video present; empty string = default dir under project. */
  video?: string;
  /** Recording viewport, e.g. 1920x1080 (--video-viewport). */
  videoViewport?: string;
  /** Global Mem seed JSON (--data). */
  data?: string;
  /** Fill any requires key with no --data coverage from registerMemStub's registry (--mem-stub). */
  memStub?: boolean;
  /** run only: explore every .branch() path (runBranchRegression), cloning the session at each branch point. */
  allBranches?: boolean;
  /** --all-branches only: one shared session (no cloning) - follows the single live-dispatch path instead. */
  sharedSession?: boolean;
  /** Flow/chain spec from --blocks <spec>. */
  blocks?: string;
  /** auto path-find: --blocks <fromCheckpoint> <toCheckpoint>. */
  blocksFromTo?: [string, string];
  cli?: boolean;
  mermaid?: boolean;
  map?: boolean;
  /** demo: faster transitions / shorter auto-next gates. */
  fast?: boolean;
  /** demo: classic wrap-all block chips instead of carousel. */
  fullStepper?: boolean;
  /** demo: force compact mini panel (--mini / WAYGRAPH_MINI=1). */
  miniStepper?: boolean;
  /** demo: floating todo dock side (--todo-left | --todo-right). */
  todoPos?: "left" | "right";
  /** demo: todo-dock UX — full list / no smart behaviors. */
  todoUiFull?: boolean;
  /** demo: todo-dock UX — smart compact/collision/behind (default). */
  todoUiSmart?: boolean;
  /** demo/run: expand fastForwardComposeBlock inners as separate steps. */
  ffExpand?: boolean;
  /** demo/run: dispute mode — expand FF + keep blitz on former FF inners. */
  ffDisabled?: boolean;
  /** Positional args with run flags stripped. */
  positionals: string[];
  /** browser/pilot: merge Block trees from preset names or paths (repeatable). */
  inject?: string[];
  /** browser/pilot: navigate on start (disables blank page). */
  goto?: string;
  /** browser/pilot: force about:blank on start. */
  blank?: boolean;
  /** browser/pilot: headless session (default visible for browser). */
  headlessBrowser?: boolean;
  /** browser/pilot sessions: machine-readable JSON. */
  json?: boolean;
  /** check/typecheck: skip bad-practice warnings. */
  noPractices?: boolean;
  /** __auto-serve (the detached session child): its session id. */
  sessionId?: string;
}


/** Which commands document an option in their help (the parser accepts every option for every command that parses run flags). */
type HelpFor = "demo" | "run" | "session";

/**
 * Every flag the run-style commands take: `parseArgs` reads them from this table, and `usage.ts` prints the demo / run
 * help from it, so the two can't drift. A flag not listed here is an error, not a stray positional.
 */
export const RUN_OPTIONS = {
  "blocks": { type: "string", value: "<flow|file|spec>", help: "Flow export, .flow.ts path or \"a then b\" chain; auto: <From> <To> Checkpoints", for: ["demo", "run"] },
  "data": { type: "string", value: "'{...}'", help: "Mem seed JSON (or inline flow({...}))", for: ["demo", "run"] },
  "mem-stub": { type: "boolean", help: "Fill any requires key --data didn't cover from registerMemStub's registry", for: ["demo", "run"] },
  "auto-next": { type: "boolean", help: "Auto-advance steps", for: ["demo"] },
  "no-auto-next": { type: "boolean", help: "Wait for Next on every step (the default)", for: ["demo"] },
  "fast": { type: "boolean", help: "Shorter auto-next / Next gates (keeps the smooth cursor)", for: ["demo"] },
  "full": { type: "boolean", help: "Classic wrap-all block chips (default: carousel)", for: ["demo"] },
  "mini": { type: "boolean", help: "Force the compact mini panel (Hide pill + Next)", for: ["demo"] },
  "todo-left": { type: "boolean", help: "Floating checklist dock on the left (also ctx.todos(id, items, { pos }))", for: ["demo"] },
  "todo-right": { type: "boolean", help: "Floating checklist dock on the right", for: ["demo"] },
  "todo-full": { type: "boolean", help: "Full checklist: no compact / collision / behind-ring", for: ["demo"] },
  "todo-smart": { type: "boolean", help: "Compact + collision + behind-ring (the default)", for: ["demo"] },
  "ff-expand": { type: "boolean", help: "Expand fastForwardComposeBlock inners as separate steps", for: ["demo", "run"] },
  "ff-disabled": { type: "boolean", help: "Dispute: expand FF; blitz kept on those inners", for: ["demo", "run"] },
  "auto-play-video": { type: "boolean", help: "Unattended + recorded: --auto-next + --video (+ step); headless", for: ["demo"] },
  "auto-play-video-head": { type: "boolean", help: "Same, but keep the browser visible (--non-headless)", for: ["demo"] },
  "video": { type: "string", value: "[dir]", help: "Record .webm (default ~/Downloads/waygraph-videos/<project>, video.dir, WAYGRAPH_VIDEO_DIR)", for: ["demo", "run"] },
  "video-viewport": { type: "string", value: "WxH", help: "Recording size (demo 1920x1080, run 1280x720)", for: ["demo", "run"] },
  "step": { type: "boolean", help: "Step through with the overlay", for: ["run"] },
  "no-step": { type: "boolean", help: "No step overlay (demo: plain run with narration off)", for: ["demo"] },
  "all-branches": { type: "boolean", help: "Bare Flow ref only: explore every branch() path, cloning the session at each", for: ["run"] },
  "shared-session": { type: "boolean", help: "With --all-branches: one shared session (follows only the live path)", for: ["run"] },
  "non-headless": { type: "boolean", help: "Show the browser", for: ["demo", "run"] },
  "title": { type: "string", value: "<text>", help: "Banner title", for: ["demo", "run"] },
  "base-url": { type: "string", value: "<url>", help: "Base URL (beats WAYGRAPH_BASE_URL and the config)", for: ["demo", "run", "session"] },
  "inject": { type: "string", multiple: true, value: "<preset|path>", help: "Merge an external Block library (repeatable)", for: ["session"] },
  "goto": { type: "string", value: "<url>", help: "Navigate on start (disables the blank page)", for: ["session"] },
  "blank": { type: "boolean", help: "Force about:blank on start (default)", for: ["session"] },
  "headless": { type: "boolean", help: "Headless session (default: visible browser)", for: ["session"] },
  "cli": { type: "boolean", help: "Terminal picker instead of the browser panel", for: ["session"] },
  "json": { type: "boolean", help: "Machine-readable JSON", for: ["session"] },
  "mermaid": { type: "boolean", help: "Print the graph as Mermaid" },
  "map": { type: "boolean", help: "Print the map" },
  "no-practices": { type: "boolean", help: "check / typecheck: skip bad-practice warnings" },
  "session-id": { type: "string", help: "Internal: the id a detached session child serves (set by browser start)" },
} as const satisfies Record<string, { type: "boolean" | "string"; multiple?: boolean; value?: string; help: string; for?: readonly HelpFor[] }>;

/** The help lines for one command's options, from {@link RUN_OPTIONS}. */
export function optionHelp(command: HelpFor, indent = 17): string {
  const rows = Object.entries(RUN_OPTIONS)
    .filter(([, o]) => "for" in o && (o.for as readonly HelpFor[]).includes(command))
    .map(([name, o]) => [`--${name}${"value" in o ? " " + o.value : ""}`, o.help] as const);
  const width = Math.max(...rows.map(([f]) => f.length)) + 2;
  return rows.map(([f, h]) => " ".repeat(indent) + f.padEnd(width) + h).join("\n");
}

const PARSE_OPTIONS = Object.fromEntries(
  Object.entries(RUN_OPTIONS).map(([name, o]) => [name, { type: o.type, multiple: "multiple" in o && o.multiple }]),
) as { [K in keyof typeof RUN_OPTIONS]: { type: (typeof RUN_OPTIONS)[K]["type"]; multiple: (typeof RUN_OPTIONS)[K] extends { multiple: true } ? true : false } };


/**
 * Looks like a Checkpoint tag for auto --blocks From To (PascalCase).
 * Kebab-case Block names must not trigger path-find mode.
 */
function looksLikeCheckpointArg(s: string): boolean {
  if (!s || s.startsWith("-")) return false;
  if (s.includes("then") || s.includes("(") || s.includes("{") || s.includes("/")) return false;
  if (s === "." || s.includes(".")) return false;
  return /^[A-Z][A-Za-z0-9_]*$/.test(s);
}


/** Reads run/demo/auto/session flags with `node:util`'s parseArgs; an unknown flag or a missing value exits with the reason. */
export function parseRunFlags(argv: string[]): RunFlags {
  // `--video` takes an optional folder: bare (end of args, or another flag next) means the default folder.
  const args = argv.map((a, i) => (a === "--video" && (argv[i + 1] === undefined || argv[i + 1]!.startsWith("-")) ? "--video=" : a));
  let parsed;
  try {
    parsed = parseArgs({ args, options: PARSE_OPTIONS, allowPositionals: true, strict: true, tokens: true });
  } catch (err) {
    console.error(`waygraph: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  const v = parsed.values;
  const positionals = [...parsed.positionals];
  const out: RunFlags = { positionals };
  // `--blocks <From> <To>`: two Checkpoints in a row are a path to find, not a spec and a project path.
  const blocksToken = parsed.tokens.find((t) => t.kind === "option" && t.name === "blocks" && !t.inlineValue);
  const after = blocksToken && parsed.tokens.find((t) => t.kind === "positional" && t.index === blocksToken.index + 2);
  if (v.blocks !== undefined && after?.kind === "positional" && looksLikeCheckpointArg(v.blocks) && looksLikeCheckpointArg(after.value)) {
    out.blocksFromTo = [v.blocks, after.value];
    positionals.splice(positionals.indexOf(after.value), 1);
  } else if (v.blocks !== undefined) out.blocks = v.blocks;
  if (v.step) out.step = true;
  if (v["no-step"]) out.step = false;
  if (v["auto-next"]) out.autoplay = true;
  if (v["no-auto-next"]) out.autoplay = false;
  if (v["auto-play-video"] || v["auto-play-video-head"]) out.autoPlayVideo = true;
  if (v["non-headless"] || v["auto-play-video-head"]) out.nonHeadless = true;
  if (v.fast) out.fast = true;
  if (v.full) out.fullStepper = true;
  if (v.mini) out.miniStepper = true;
  if (v["todo-left"]) out.todoPos = "left";
  if (v["todo-right"]) out.todoPos = "right";
  if (v["todo-full"]) out.todoUiFull = true;
  if (v["todo-smart"]) out.todoUiSmart = true;
  if (v["ff-expand"] || v["ff-disabled"]) out.ffExpand = true;
  if (v["ff-disabled"]) out.ffDisabled = true;
  if (v.headless) out.headlessBrowser = true;
  if (v.json) out.json = true;
  if (v["no-practices"]) out.noPractices = true;
  if (v["session-id"] !== undefined) out.sessionId = v["session-id"];
  if (v.blank) out.blank = true;
  if (v.goto !== undefined) out.goto = v.goto;
  if (v.inject !== undefined) out.inject = [...v.inject];
  if (v.cli) out.cli = true;
  if (v.mermaid) out.mermaid = true;
  if (v.map) out.map = true;
  if (v["base-url"] !== undefined) out.baseUrl = v["base-url"];
  if (v.title !== undefined) out.title = v.title;
  if (v.data !== undefined) out.data = v.data;
  if (v["mem-stub"]) out.memStub = true;
  if (v["all-branches"]) out.allBranches = true;
  if (v["shared-session"]) out.sharedSession = true;
  if (v.video !== undefined) out.video = v.video;
  if (v["video-viewport"] !== undefined) out.videoViewport = v["video-viewport"];
  return out;
}


/** Parses WAYGRAPH_VIDEO_VIEWPORT / --video-viewport: "1920x1080" or "1920,1080". */
function parseVideoViewportFlag(raw: string | undefined): { width: number; height: number } | null {
  if (!raw?.trim()) return null;
  const m = raw.trim().match(/^(\d{3,5})[xX,](\d{3,5})$/);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < 320 || height < 240 || width > 7680 || height > 4320) return null;
  return { width, height };
}


/** Writes flag values into process.env so the chain child inherits them. Flags beat prior env. */
export function applyRunFlags(flags: RunFlags, opts?: { allowAutoPlayVideo?: boolean; allowDemoUi?: boolean }): void {
  if (flags.autoPlayVideo) {
    if (!opts?.allowAutoPlayVideo) {
      console.error("waygraph: --auto-play-video is a demo-only flag (QA watch + record)");
      process.exit(1);
    }
    if (flags.autoplay === undefined) flags.autoplay = true;
    if (flags.video === undefined) flags.video = "";
    // Overlay narration (captions/rings/slides) needs step mode to run, but
    // --auto-play-video is unattended-and-recorded by design - no human
    // has to watch a live window for Playwright's own recordVideo to
    // capture the right thing. Headless by default; --non-headless (or the
    // --auto-play-video-head alias, parsed above) opts back into a
    // visible browser for someone who wants to watch it live too.
    setEnv("WAYGRAPH_STEP", "1");
    if (!flags.nonHeadless && envString("WAYGRAPH_HEADED") === undefined) {
      setEnv("WAYGRAPH_HEADED", "0");
    }
  }
  if (
    (flags.fast || flags.fullStepper || flags.miniStepper || flags.todoPos || flags.todoUiFull || flags.todoUiSmart) &&
    !opts?.allowDemoUi
  ) {
    console.error(
      "waygraph: --fast / --full / --mini / --todo-left|--todo-right / --todo-full|--todo-smart are demo-only flags",
    );
    process.exit(1);
  }
  if (flags.step === true) {
    setEnv("WAYGRAPH_STEP", "1");
    setEnv("WAYGRAPH_HEADED", "1");
  } else if (flags.step === false) {
    setEnv("WAYGRAPH_STEP", "0");
  }
  if (flags.autoplay === true) {
    setEnv("WAYGRAPH_AUTOPLAY", "1");
  } else if (flags.autoplay === false) {
    setEnv("WAYGRAPH_AUTOPLAY", "0");
  }
  if (flags.nonHeadless) {
    setEnv("WAYGRAPH_HEADED", "1");
  }
  // Any --video on demo/run: headless unless --non-headless already won.
  if (flags.video !== undefined && !flags.nonHeadless && envString("WAYGRAPH_HEADED") === undefined) {
    setEnv("WAYGRAPH_HEADED", "0");
  }
  if (flags.baseUrl !== undefined) {
    setEnv("WAYGRAPH_BASE_URL", flags.baseUrl);
  }
  if (flags.title !== undefined) {
    setEnv("WAYGRAPH_TITLE", flags.title);
  }
  if (flags.video !== undefined) {
    setEnv("WAYGRAPH_VIDEO", flags.video || "1");
  }
  if (flags.videoViewport !== undefined) {
    if (!parseVideoViewportFlag(flags.videoViewport)) {
      console.error('waygraph: --video-viewport must look like "1920x1080"');
      process.exit(1);
    }
    setEnv("WAYGRAPH_VIDEO_VIEWPORT", flags.videoViewport);
  }
  if (flags.data !== undefined) {
    setEnv("WAYGRAPH_DATA", flags.data);
  }
  if (flags.memStub) {
    setEnv("WAYGRAPH_MEM_STUB", "1");
  }
  if (flags.allBranches) {
    setEnv("WAYGRAPH_ALL_BRANCHES", "1");
  }
  if (flags.sharedSession) {
    setEnv("WAYGRAPH_SHARED_SESSION", "1");
  }
  if (flags.fast) {
    setEnv("WAYGRAPH_DEMO_FAST", "1");
  }
  if (flags.fullStepper) {
    setEnv("WAYGRAPH_STEPPER", "full");
  }
  if (flags.miniStepper) {
    setEnv("WAYGRAPH_MINI", "1");
  }
  if (flags.todoPos === "left" || flags.todoPos === "right") {
    setEnv("WAYGRAPH_TODO_POS", flags.todoPos);
  }
  if (flags.todoUiFull) {
    setEnv("WAYGRAPH_TODO_UI", "full");
  } else if (flags.todoUiSmart) {
    setEnv("WAYGRAPH_TODO_UI", "smart");
  }
  if (flags.ffExpand) {
    setEnv("WAYGRAPH_FF_EXPAND", "1");
  }
  if (flags.ffDisabled) {
    setEnv("WAYGRAPH_FF_DISABLED", "1");
    setEnv("WAYGRAPH_FF_EXPAND", "1");
  }
}



/**
 * Friendly demo defaults: STEP on; headed only for live watch (no --video).
 * --video / --auto-play-video => headless unless --non-headless.
 * Call after applyRunFlags so explicit flags already won.
 */
export async function applyDemoDefaults(projectDir: string): Promise<void> {
  // Config first: its defaults (headed, autoNext, pace...) must land before the demo defaults below fill the same variables.
  await loadWaygraphConfig(projectDir);
  if (envString("WAYGRAPH_STEP") === undefined) setEnv("WAYGRAPH_STEP", "1");
  if (envFlag("WAYGRAPH_STEP") && envString("WAYGRAPH_HEADED") === undefined) {
    // Recording locks headless - a live window fights fixed video viewport /
    // device shell centering. Watch live only with --non-headless.
    setEnv("WAYGRAPH_HEADED", envString("WAYGRAPH_VIDEO") ? "0" : "1");
  }
  // Manual Next by default. --auto-next / --auto-play-video flip this.
  if (envString("WAYGRAPH_AUTOPLAY") === undefined) {
    if (envString("WAYGRAPH_VIDEO") && envString("WAYGRAPH_STEP") === "0") {
      setEnv("WAYGRAPH_AUTOPLAY", "1");
    } else {
      setEnv("WAYGRAPH_AUTOPLAY", "0");
    }
  }
  if (!envString("WAYGRAPH_BASE_URL")) {
    const resolved = await resolveBaseUrl(projectDir);
    if (resolved) setEnv("WAYGRAPH_BASE_URL", resolved);
  }
}


export function resolveProjectDir(flags: RunFlags, fallbackIndex = 0): string {
  const cand = flags.positionals[fallbackIndex] ?? process.cwd();
  return resolve(cand);
}


export function resolveSpec(flags: RunFlags): string | undefined {
  return flags.blocks ?? flags.positionals[0];
}


/** `shop.flow.ts` / `src/flows/cart-bulk.flow.ts` / absolute path — not a Checkpoint or export id. */
export function looksLikeFlowFileRef(ref: string): boolean {
  if (!ref || ref.includes("then") || ref.includes("(")) return false;
  return /\.flow\.ts$/i.test(ref) || (/\.ts$/i.test(ref) && (ref.includes("/") || ref.includes("\\")));
}


function flowExportNameFromBasename(filePath: string): string {
  const base = basename(filePath).replace(/\.flow\.ts$/i, "").replace(/\.ts$/i, "");
  const camel = base.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  return /Flow$/i.test(camel) ? camel : `${camel}Flow`;
}


/**
 * Map a `.flow.ts` path (relative to project or absolute) to its Flow export
 * name so the chain runner can `findFlow(exportName)`. Prefers
 * `shop.flow.ts` → `shopFlow`. Reads source only (no import) so the outer CLI
 * does not dual-load `@playwright/test` against the project tree.
 */
async function resolveFlowFileToExport(projectDir: string, fileArg: string): Promise<string> {
  let abs = resolve(projectDir, fileArg);
  if (!existsSync(abs)) {
    const want = basename(fileArg);
    const hits = walkDir(projectDir, new RegExp(`${want.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    if (hits.length === 1) abs = hits[0]!;
    else if (hits.length === 0) {
      throw new Error(`waygraph: no flow file "${fileArg}" under ${projectDir}`);
    } else {
      throw new Error(
        `waygraph: "${fileArg}" matches ${hits.length} files - use a path from \`waygraph list\``,
      );
    }
  }
  const expected = flowExportNameFromBasename(abs);
  const exported = exportedNames(parseSource(abs));
  if (exported.includes(expected)) return expected;
  const unique = [...new Set(exported.filter((n) => n.endsWith("Flow")))];
  if (unique.length === 1) return unique[0]!;
  if (unique.includes(expected)) return expected;
  if (unique.length === 0) {
    throw new Error(
      `waygraph: ${relative(projectDir, abs)} has no exported *Flow (expected ${expected})`,
    );
  }
  throw new Error(
    `waygraph: ${relative(projectDir, abs)} exports ${unique.join(", ")} - pass the export name or rename to ${expected}`,
  );
}


/**
 * Expand `.flow.ts` path segments in a run/demo spec to export names.
 * `src/flows/shop.flow.ts` → `shopFlow`; leaves `loginFlow then nav-cart` alone.
 */
export async function expandSpecFlowFiles(projectDir: string, spec: string): Promise<string> {
  const parts = spec.split(/\bthen\b/).map((s) => s.trim()).filter((s) => s.length > 0);
  const out: string[] = [];
  for (const part of parts) {
    const m = /^([^\s(]+)(\s*\([\s\S]*\))?$/.exec(part);
    if (!m) {
      out.push(part);
      continue;
    }
    const ref = m[1]!;
    const payload = m[2] ?? "";
    if (looksLikeFlowFileRef(ref)) {
      const exportName = await resolveFlowFileToExport(projectDir, ref);
      out.push(exportName + payload);
    } else {
      out.push(part);
    }
  }
  return out.join(" then ");
}
