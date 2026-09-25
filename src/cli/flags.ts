// Split out of the former 8,700-line cli.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { basename, join, relative, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { walkDir } from "./discover.js";

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
  /** Flow/chain spec from --blocks <spec>. */
  blocks?: string;
  /** auto path-find: --blocks <fromCheckpoint> <toCheckpoint>. */
  blocksFromTo?: [string, string];
  cli?: boolean;
  /** auto --cli --detach: run the explore session as a background socket server. */
  detach?: boolean;
  /** Force headed panel (compat; bare try auto / auto already headed). */
  headed?: boolean;
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
}


function takeFlagValue(argv: string[], i: number, a: string, flag: string): { value: string; nextI: number } {
  if (a.startsWith(flag + "=")) {
    return { value: a.slice(flag.length + 1), nextI: i };
  }
  const v = argv[i + 1];
  if (v === undefined || (v.startsWith("-") && !a.includes("="))) {
    console.error(`waygraph: ${flag} needs a value`);
    process.exit(1);
  }
  return { value: v, nextI: i + 1 };
}


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


/**
 * Pulls run/demo/auto flags out of argv. Unknown bare `--*` that are not
 * recognized stay as positionals only when they are project paths; known
 * explore flags (--cli/--mermaid/--map) are parsed here.
 */
export function parseRunFlags(argv: string[]): RunFlags {
  const out: RunFlags = { positionals: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--step") {
      out.step = true;
    } else if (a === "--no-step") {
      out.step = false;
    } else if (a === "--auto-next" || a === "--autoplay") {
      out.autoplay = true;
    } else if (a === "--no-auto-next" || a === "--no-autoplay") {
      out.autoplay = false;
    } else if (a === "--auto-play-video") {
      out.autoPlayVideo = true;
    } else if (a === "--auto-play-video-head") {
      out.autoPlayVideo = true;
      out.nonHeadless = true;
    } else if (a === "--fast") {
      out.fast = true;
    } else if (a === "--full") {
      out.fullStepper = true;
    } else if (a === "--mini" || a === "--stepper-mini") {
      out.miniStepper = true;
    } else if (a === "--todo-left") {
      out.todoPos = "left";
    } else if (a === "--todo-right") {
      out.todoPos = "right";
    } else if (a === "--todo-full" || a === "--no-todo-smart") {
      out.todoUiFull = true;
    } else if (a === "--todo-smart") {
      out.todoUiSmart = true;
    } else if (a === "--ff-expand") {
      out.ffExpand = true;
    } else if (a === "--ff-disabled" || a === "--no-ff") {
      out.ffDisabled = true;
      out.ffExpand = true;
    } else if (a === "--non-headless") {
      out.nonHeadless = true;
    } else if (a === "--headless") {
      out.headlessBrowser = true;
    } else if (a === "--json") {
      out.json = true;
    } else if (a === "--no-practices") {
      out.noPractices = true;
    } else if (a === "--blank") {
      out.blank = true;
    } else if (a === "--goto" || a.startsWith("--goto=")) {
      const t = takeFlagValue(argv, i, a, "--goto");
      out.goto = t.value;
      i = t.nextI;
    } else if (a === "--inject" || a.startsWith("--inject=")) {
      const t = takeFlagValue(argv, i, a, "--inject");
      out.inject ??= [];
      out.inject.push(t.value);
      i = t.nextI;
    } else if (a === "--cli") {
      out.cli = true;
    } else if (a === "--detach") {
      out.detach = true;
    } else if (a === "--headed") {
      out.headed = true;
    } else if (a === "--mermaid") {
      out.mermaid = true;
    } else if (a === "--map") {
      out.map = true;
    } else if (a === "--base-url" || a.startsWith("--base-url=")) {
      const t = takeFlagValue(argv, i, a, "--base-url");
      out.baseUrl = t.value;
      i = t.nextI;
    } else if (a === "--title" || a.startsWith("--title=")) {
      const t = takeFlagValue(argv, i, a, "--title");
      out.title = t.value;
      i = t.nextI;
    } else if (a === "--data" || a.startsWith("--data=")) {
      const t = takeFlagValue(argv, i, a, "--data");
      out.data = t.value;
      i = t.nextI;
    } else if (a === "--mem-stub") {
      out.memStub = true;
    } else if (a === "--video" || a.startsWith("--video=")) {
      if (a.startsWith("--video=")) {
        out.video = a.slice("--video=".length);
      } else {
        const v = argv[i + 1];
        if (v === undefined || v.startsWith("-")) {
          out.video = "";
        } else {
          out.video = v;
          i++;
        }
      }
    } else if (a === "--video-viewport" || a.startsWith("--video-viewport=")) {
      const t = takeFlagValue(argv, i, a, "--video-viewport");
      out.videoViewport = t.value;
      i = t.nextI;
    } else if (a === "--blocks" || a.startsWith("--blocks=")) {
      if (a.startsWith("--blocks=")) {
        out.blocks = a.slice("--blocks=".length);
      } else {
        const v1 = argv[++i];
        if (!v1 || v1.startsWith("-")) {
          console.error("waygraph: --blocks needs a flow/spec or <from> <to> checkpoints");
          process.exit(1);
        }
        const v2 = argv[i + 1];
        if (v2 && looksLikeCheckpointArg(v1) && looksLikeCheckpointArg(v2)) {
          out.blocksFromTo = [v1, v2];
          i++;
        } else {
          out.blocks = v1;
        }
      }
    } else {
      out.positionals.push(a);
    }
  }
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
    process.env.WAYGRAPH_STEP = "1";
    if (!flags.nonHeadless && process.env.WAYGRAPH_HEADED === undefined) {
      process.env.WAYGRAPH_HEADED = "0";
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
    process.env.WAYGRAPH_STEP = "1";
    process.env.WAYGRAPH_HEADED = "1";
  } else if (flags.step === false) {
    process.env.WAYGRAPH_STEP = "0";
  }
  if (flags.autoplay === true) {
    process.env.WAYGRAPH_AUTOPLAY = "1";
  } else if (flags.autoplay === false) {
    process.env.WAYGRAPH_AUTOPLAY = "0";
  }
  if (flags.nonHeadless) {
    process.env.WAYGRAPH_HEADED = "1";
  }
  // Any --video on demo/run: headless unless --non-headless already won.
  if (flags.video !== undefined && !flags.nonHeadless && process.env.WAYGRAPH_HEADED === undefined) {
    process.env.WAYGRAPH_HEADED = "0";
  }
  if (flags.baseUrl !== undefined) {
    process.env.WAYGRAPH_BASE_URL = flags.baseUrl;
  }
  if (flags.title !== undefined) {
    process.env.WAYGRAPH_TITLE = flags.title;
  }
  if (flags.video !== undefined) {
    process.env.WAYGRAPH_VIDEO = flags.video || "1";
  }
  if (flags.videoViewport !== undefined) {
    if (!parseVideoViewportFlag(flags.videoViewport)) {
      console.error('waygraph: --video-viewport must look like "1920x1080"');
      process.exit(1);
    }
    process.env.WAYGRAPH_VIDEO_VIEWPORT = flags.videoViewport;
  }
  if (flags.data !== undefined) {
    process.env.WAYGRAPH_DATA = flags.data;
  }
  if (flags.memStub) {
    process.env.WAYGRAPH_MEM_STUB = "1";
  }
  if (flags.fast) {
    process.env.WAYGRAPH_DEMO_FAST = "1";
  }
  if (flags.fullStepper) {
    process.env.WAYGRAPH_STEPPER = "full";
  }
  if (flags.miniStepper) {
    process.env.WAYGRAPH_MINI = "1";
  }
  if (flags.todoPos === "left" || flags.todoPos === "right") {
    process.env.WAYGRAPH_TODO_POS = flags.todoPos;
  }
  if (flags.todoUiFull) {
    process.env.WAYGRAPH_TODO_UI = "full";
  } else if (flags.todoUiSmart) {
    process.env.WAYGRAPH_TODO_UI = "smart";
  }
  if (flags.ffExpand) {
    process.env.WAYGRAPH_FF_EXPAND = "1";
  }
  if (flags.ffDisabled) {
    process.env.WAYGRAPH_FF_DISABLED = "1";
    process.env.WAYGRAPH_FF_EXPAND = "1";
  }
}


/**
 * BASE_URL when neither --base-url nor WAYGRAPH_BASE_URL is set:
 * package.json `waygraph.baseUrl` (or `baseURL`), then playwright.config `baseURL`.
 */
export function resolveBaseUrl(projectDir: string): string | undefined {
  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        waygraph?: { baseUrl?: string; baseURL?: string };
        config?: { waygraph?: { baseUrl?: string; baseURL?: string } };
      };
      const fromPkg =
        pkg.waygraph?.baseUrl ??
        pkg.waygraph?.baseURL ??
        pkg.config?.waygraph?.baseUrl ??
        pkg.config?.waygraph?.baseURL;
      if (typeof fromPkg === "string" && fromPkg.trim()) return fromPkg.trim();
    } catch {
      // ignore malformed package.json - fall through to playwright
    }
  }
  for (const name of ["playwright.config.ts", "playwright.config.mts", "playwright.config.js", "playwright.config.mjs"]) {
    const p = join(projectDir, name);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, "utf-8");
    const m = src.match(/baseURL\s*:\s*["']([^"']+)["']/);
    if (m?.[1]) return m[1];
  }
  return undefined;
}


/**
 * Friendly demo defaults: STEP on; headed only for live watch (no --video).
 * --video / --auto-play-video => headless unless --non-headless.
 * Call after applyRunFlags so explicit flags already won.
 */
export function applyDemoDefaults(projectDir: string): void {
  if (process.env.WAYGRAPH_STEP === undefined) process.env.WAYGRAPH_STEP = "1";
  if (process.env.WAYGRAPH_STEP === "1" && process.env.WAYGRAPH_HEADED === undefined) {
    // Recording locks headless - a live window fights fixed video viewport /
    // device shell centering. Watch live only with --non-headless.
    process.env.WAYGRAPH_HEADED = process.env.WAYGRAPH_VIDEO ? "0" : "1";
  }
  // Manual Next by default. --auto-next / --auto-play-video flip this.
  if (process.env.WAYGRAPH_AUTOPLAY === undefined) {
    if (process.env.WAYGRAPH_VIDEO && process.env.WAYGRAPH_STEP === "0") {
      process.env.WAYGRAPH_AUTOPLAY = "1";
    } else {
      process.env.WAYGRAPH_AUTOPLAY = "0";
    }
  }
  if (!process.env.WAYGRAPH_BASE_URL) {
    const resolved = resolveBaseUrl(projectDir);
    if (resolved) process.env.WAYGRAPH_BASE_URL = resolved;
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
  const src = readFileSync(abs, "utf-8");
  if (new RegExp(`\\bexport\\s+(?:const|let|var|async\\s+function|function)\\s+${expected}\\b`).test(src)) {
    return expected;
  }
  if (new RegExp(`\\bexport\\s*\\{[^}]*\\b${expected}\\b`).test(src)) {
    return expected;
  }
  const flowNames = [
    ...src.matchAll(/\bexport\s+(?:const|let|var|async\s+function|function)\s+(\w*Flow)\b/g),
  ].map((m) => m[1]!);
  const unique = [...new Set(flowNames)];
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
