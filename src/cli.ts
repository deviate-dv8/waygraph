#!/usr/bin/env node

/**
 * waygraph CLI -- tooling around this same package's engine.
 *
 * Primary verbs (less is more):
 *   auto   Explore picker; `.flow.ts` / `--blocks From To` = run that path
 *   demo   Watch (step overlay); `--blocks` `--data` `--auto-next` `--fast` `--full` `--mini` `--ff-expand` `--ff-disabled`
 *   run    Execute; `--blocks` `--data` `--non-headless` `--video`
 *
 * Also: list / nav / validate / check / graph / init / agent-dive / traverse / try
 * Aliases (one release): `chain` -> run/demo --blocks; `--autoplay` -> `--auto-next`
 *
 * "project" defaults to cwd. Flags beat WAYGRAPH_* env.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, rmSync, cpSync, mkdirSync, mkdtempSync, statSync, type Dirent } from "node:fs";
import { resolve, relative, join, basename, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { discoverGraph, toMermaid, findOrphanBlocks, findBlockPath } from "./graph.js";
import { checkMap } from "./map-check.js";
import { runAutoExplore } from "./auto-explore-run.js";
import { pilotStart } from "./pilot.js";
import {
  spawnDetachedSession,
  requestSession,
  runAttachLoop,
  runAutoServeCommand,
} from "./auto-session-ipc.js";
import { runAgentDive, type AgentDiveLoop } from "./agent-dive.js";
import { runTraverse } from "./traverse-run.js";
import { parseMinEdgeCoverage } from "./traverse-coverage.js";
import {
  isFileSelectToken,
  parseBlocksSelect,
} from "./blocks-select.js";

// ---------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------

function walkDir(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
      results.push(...walkDir(full, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function discoverFlows(projectDir: string): string[] {
  return walkDir(projectDir, /\.flow\.ts$/);
}

// ---------------------------------------------------------------------------
// Static analysis for `list`/`nav` (no import, regex only)
// ---------------------------------------------------------------------------

function extractFlowNames(filePath: string): string[] {
  const src = readFileSync(filePath, "utf-8");
  const names: string[] = [];
  const re = /export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[=:]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    if (name !== undefined) names.push(name);
  }
  return names;
}

/** `LoginBlock` -> `"login"`; `OverviewMetricsBlock` -> `"overview-metrics"`. */
function blockExportToLabel(exportId: string): string {
  const base = exportId.replace(/Block$/, "");
  return base
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/** Every `...Block` identifier a `.flow.ts` file imports, in source order. */
function parseBlockImports(filePath: string): string[] {
  const src = readFileSync(filePath, "utf-8");
  const names: string[] = [];
  const re = /import\s*\{([^}]*)\}\s*from\s*["'][^"']*\.block(?:\.js)?["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    for (const part of m[1]!.split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0]?.trim();
      if (name) names.push(name);
    }
  }
  return names;
}

/** Every `page.goto("...")` string literal in a file, in source order. */
function extractGotos(filePath: string): string[] {
  const src = readFileSync(filePath, "utf-8");
  const results: string[] = [];
  const re = /\.goto\(\s*["'`]([^"'`]*)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const url = m[1];
    if (url !== undefined) results.push(url);
  }
  return results;
}

/** Every `Trait.url({ pathname: "..." })` target in a file, in source order. */
function extractUrlTraits(filePath: string): string[] {
  const src = readFileSync(filePath, "utf-8");
  const results: string[] = [];
  const re = /Trait\.url\(\s*\{[^}]*pathname:\s*["'`]([^"'`]*)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const url = m[1];
    if (url !== undefined) results.push(url);
  }
  return results;
}

// ---------------------------------------------------------------------------
// `list`
// ---------------------------------------------------------------------------

function listCommand(projectDir: string): void {
  const files = discoverFlows(projectDir);
  if (files.length === 0) {
    console.log(`waygraph: no flows found under ${projectDir}`);
    return;
  }
  for (const file of files) {
    const rel = relative(projectDir, file);
    for (const name of extractFlowNames(file)) {
      console.log(`${rel}  ${name}`);
    }
  }
}

// ---------------------------------------------------------------------------
// `nav`
// ---------------------------------------------------------------------------

function navCommand(projectDir: string, flowName: string | undefined): void {
  const files = discoverFlows(projectDir);
  const targets = flowName
    ? files.filter((f) => extractFlowNames(f).includes(flowName))
    : files;
  if (targets.length === 0) {
    console.error(
      flowName
        ? `waygraph nav: no flow named "${flowName}" found under ${projectDir}`
        : `waygraph: no flows found under ${projectDir}`,
    );
    process.exitCode = 1;
    return;
  }
  for (const file of targets) {
    for (const name of extractFlowNames(file)) {
      console.log(`${name}  (${relative(projectDir, file)})`);
      const blockDir = projectDir;
      for (const blockExport of parseBlockImports(file)) {
        console.log(`  -> ${blockExportToLabel(blockExport)}`);
        const blockFile = walkDir(blockDir, /\.block\.ts$/).find((f) =>
          readFileSync(f, "utf-8").includes(`export const ${blockExport}`),
        );
        if (!blockFile) continue;
        for (const url of extractGotos(blockFile)) console.log(`       goto ${url}`);
        for (const url of extractUrlTraits(blockFile)) console.log(`       verify url ~ ${url}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Dynamic import + validation
// ---------------------------------------------------------------------------

async function importModule(filePath: string): Promise<Record<string, unknown>> {
  const url = new URL(`file://${resolve(filePath)}`);
  return (await import(url.href)) as Record<string, unknown>;
}

/** Kept as a named alias - `run`/`validate` below were written against this name first. */
const importFlowFile = importModule;

function isFlowLike(val: unknown): val is { run: (...args: unknown[]) => Promise<unknown> } {
  if (val === null || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  return typeof obj.run === "function";
}

// ---------------------------------------------------------------------------
// `chain`
// ---------------------------------------------------------------------------

/**
 * `chain` cannot resolve Blocks by importing them straight into THIS
 * process: this CLI's own `waygraph` (this same package) already loaded -
 * and its engine does a top-level `import { chromium } from "playwright"`.
 * A target project like zsign-all installs its OWN real, separate copy of
 * both `waygraph` and `playwright` (never a symlink - see
 * `install-links=true`), so importing one of its `.block.ts` files pulls in
 * a second, physically different `playwright` package - which Playwright's
 * own runtime refuses outright ("Requiring @playwright/test second time"),
 * crashing every single import. Confirmed empirically against all 117 real
 * zsign-all Blocks - 100% failure rate, not a corner case.
 *
 * The fix: never let the two copies share a process. This script is
 * written into the TARGET project directory and run as its own child
 * process, so every bare `import("waygraph")` / `import("playwright")` it
 * does resolves relative to ITS OWN location on disk - the target
 * project's own `node_modules`, exclusively. This CLI's own copy never
 * loads in that process at all.
 */
const CHAIN_RUNNER_SCRIPT = `
import { readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolveHighlightSlots,
  resolveSlides,
  runStubPhase,
  resolveFixtureDwellMs,
  resolveSlideDwellMs,
  formatHighlightCaption,
  hasAuthoredStubAfter,
  hasAuthoredStubOnError,
  normalizeHighlightTone,
  normalizeDemoPace,
  normalizeHighlightSize,
  normalizeHighlightWeight,
  applyHighlightStyleDefaults,
  resolveStepDemoPace,
  demoPaceGateMs,
  demoPaceIsBlitz,
  demoPaceIsFast,
  demoPaceIsSlow,
  formatDemoPaceBadge,
  formatDemoPaceLabel,
  normalizeTodos,
  buildTodoDock,
  applyTodoPhase,
  advanceTodoDock,
  completeSequentialTodoDock,
  applyDevicePhase,
  resolveDeviceState,
  WAYGRAPH_RING_CSS,
} from "waygraph";

function walkDir(dir, pattern) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
      results.push(...walkDir(full, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function isBlockLike(val) {
  if (val === null || typeof val !== "object") return false;
  if (typeof val.name !== "string") return false;
  if (val.instruction === null || typeof val.instruction !== "object") return false;
  return typeof val.instruction.act === "function";
}

async function findBlock(projectDir, ref) {
  const files = walkDir(projectDir, /\\.block\\.ts$/);
  const byRuntimeName = [];
  for (const file of files) {
    let mod;
    try {
      mod = await import("file://" + file);
    } catch {
      continue;
    }
    for (const [exportName, exported] of Object.entries(mod)) {
      if (!isBlockLike(exported)) continue;
      if (exportName === ref) return { block: exported, exportName, file };
      if (exported.name === ref) byRuntimeName.push({ block: exported, exportName, file });
    }
  }
  if (byRuntimeName.length === 1) return byRuntimeName[0];
  if (byRuntimeName.length > 1) {
    throw new Error(
      "waygraph chain: \\"" + ref + "\\" matches " + byRuntimeName.length + " Blocks by name - " +
        byRuntimeName.map((b) => b.exportName + " (" + b.file + ")").join(", ") +
        ". Use the export name to disambiguate.",
    );
  }
  throw new Error("waygraph chain: no Block named \\"" + ref + "\\" found under " + projectDir);
}

/**
 * Finds an already-defined Flow by its export name (e.g. loginFlow) among
 * the project's *.flow.ts files - "I already have this wired up, just point
 * the stepper at it, no chain spec to hand-write." Flows have no runtime
 * .name of their own (unlike Blocks), so this only matches by export
 * identifier. Returns null (not a throw) when nothing matches - the caller
 * falls back to ordinary block-chain spec parsing.
 */
async function findFlow(projectDir, flowName) {
  const files = walkDir(projectDir, /\\.flow\\.ts$/);
  for (const file of files) {
    let mod;
    try {
      mod = await import("file://" + file);
    } catch {
      continue;
    }
    const candidate = mod[flowName];
    if (candidate && typeof candidate.run === "function") {
      return candidate;
    }
  }
  return null;
}

function parseChainSpec(spec) {
  return spec
    .split(/\\bthen\\b/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const m = /^([A-Za-z_$][\\w-]*)\\s*(?:\\(([\\s\\S]*)\\))?$/.exec(s);
      if (!m) {
        throw new Error(
          "waygraph chain: could not parse segment \\"" + s + "\\" - expected \\"blockName\\" or \\"blockName({...json...})\\"",
        );
      }
      const ref = m[1];
      const json = m[2] ? m[2].trim() : undefined;
      return json ? { ref, json } : { ref };
    });
}

function seedMemFromRequires(mem, requires, json, label) {
  if (requires.length === 0) {
    if (json !== undefined) {
      throw new Error(
        "waygraph chain: \\"" + label + "\\" takes no input (empty requires) but got a payload: " + json,
      );
    }
    return;
  }
  if (json === undefined) {
    // --data / WAYGRAPH_DATA supplies the same payload shape as blockName({...}).
    const fromEnv = process.env.WAYGRAPH_DATA;
    if (fromEnv && fromEnv.trim()) {
      json = fromEnv;
    } else {
      throw new Error(
        "waygraph chain: \\"" + label + "\\" requires " + requires.map((k) => k.name).join(", ") +
          " - give a JSON payload (inline blockName({...}) or --data '{...}')",
      );
    }
  }
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error("waygraph chain: \\"" + label + "\\" payload is not valid JSON - " + String(err));
  }
  // Keyed-by-name when every require name is a top-level key (preferred for
  // --data and for {"saucedemo.credentials":{...}} even with one require).
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    const keyed = requires.every((k) => k.name in parsed);
    if (keyed) {
      for (const k of requires) mem.set(k, parsed[k.name]);
      return;
    }
  }
  if (requires.length === 1) {
    mem.set(requires[0], parsed);
    return;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "waygraph chain: \\"" + label + "\\" requires " + requires.length + " keys (" +
        requires.map((k) => k.name).join(", ") + ") - payload must be an object keyed by each key's name",
    );
  }
  for (const k of requires) {
    if (!(k.name in parsed)) {
      throw new Error("waygraph chain: \\"" + label + "\\" payload is missing required key \\"" + k.name + "\\"");
    }
    mem.set(k, parsed[k.name]);
  }
}

function seedMemForBlock(mem, resolved, json) {
  seedMemFromRequires(mem, resolved.block.requires ?? [], json, resolved.exportName);
}

/**
 * Same idea as seedMemForBlock, but for a whole Flow segment
 * ("loginFlow({...}) then ...") - a Flow has no single .requires of its
 * own, so this unions every constituent Block's requires (deduped by key
 * name) and seeds them all from one JSON payload, same keyed-by-name shape
 * as a multi-key Block payload already uses.
 */
function seedMemForFlow(mem, flowBlocks, json, label) {
  const seen = new Map();
  for (const bi of flowBlocks) {
    for (const k of bi.block.requires ?? []) {
      if (!seen.has(k.name)) seen.set(k.name, k);
    }
  }
  seedMemFromRequires(mem, Array.from(seen.values()), json, label);
}

// ---------------------------------------------------------------------------
// WAYGRAPH_STEP=1 - human-verification overlay: one Block at a time, a
// browser-injected panel showing/editing that Block's MemKeys, a "Run this
// step" gate, then a highlight ring over whatever its own verify Traits just
// confirmed, then a "Next" gate before moving on. Ring CSS borrowed from
// help-center-clip-engine's video-pipeline overlay (same purple ring +
// label-under-box language, minus everything camera/narration-specific).
// Purely CLI-level orchestration - no engine changes, no change to the
// non-STEP path above.
const RING_CSS =
  // Shared with pilot-overlay.ts's showPilotVision - same ring/label CSS,
  // one source of truth (highlights.ts), so a Blind Pilot vision ring and a
  // demo stepper ring never visually drift apart.
  WAYGRAPH_RING_CSS +
  // Mouse cursor icon that travels to a target before it's acted on, plus a
  // quick expanding ripple at the moment of a click - same idea as
  // help-center-clip-engine's #clip-cursor/#clip-ring (video-pipeline). The
  // shape itself is an inline SVG set as innerHTML in installOverlay below
  // (dark fill + white stroke, same as the clip-engine's own cursor) - a
  // plain solid-white CSS clip-path (the first attempt here) had no outline
  // at all and all but disappeared against this app's light background.
  // Travel duration is JS-driven per call via --wg-cursor-ms, same reason
  // the clip engine's own comment gives: a hardcoded CSS duration would
  // make the speed param a no-op.
  "#wg-cursor{position:fixed;z-index:2147483647;width:24px;height:24px;pointer-events:none;" +
  "left:0;top:0;opacity:0;margin:0;" +
  "transition:transform var(--wg-cursor-ms,600ms) cubic-bezier(.22,1,.36,1),opacity .2s ease;" +
  "filter:drop-shadow(0 2px 4px rgba(12,12,26,.4));}" +
  "#wg-click-pulse{position:fixed;z-index:2147483647;width:14px;height:14px;" +
  "margin-left:-7px;margin-top:-7px;border-radius:50%;pointer-events:none;opacity:0;" +
  "border:2px solid #7C3AED;background:rgba(124,58,237,.25);}" +
  "#wg-click-pulse[data-tone=auto]{border-color:#9CA3AF;background:rgba(156,163,175,.28);}" +
  "#wg-click-pulse[data-tone=info]{border-color:#3B82F6;background:rgba(59,130,246,.28);}" +
  "#wg-click-pulse[data-tone=warning]{border-color:#EAB308;background:rgba(234,179,8,.28);}" +
  "#wg-click-pulse[data-tone=danger]{border-color:#EF4444;background:rgba(239,68,68,.28);}" +
  "#wg-click-pulse[data-tone=success]{border-color:#22C55E;background:rgba(34,197,94,.28);}" +
  "#wg-click-pulse.wg-pulse{animation:wg-pulse .5s ease-out;}" +
  "@keyframes wg-pulse{0%{opacity:.9;transform:scale(.4);}100%{opacity:0;transform:scale(2.4);}}" +
  // Spotlight: dim everything except the highlight target (focus: true).
  "#wg-focus-veil{position:fixed;z-index:2147483644;pointer-events:none;" +
  "border-radius:12px;box-shadow:0 0 0 9999px rgba(8,4,20,.62);" +
  "opacity:0;transition:opacity .3s ease,left .3s ease,top .3s ease,width .3s ease,height .3s ease;}" +
  "#wg-focus-veil.wg-in{opacity:1;}" +
  // Touch swipe trail (mobile/tablet orientation + device theater).
  "#wg-swipe-layer{position:fixed;inset:0;z-index:2147483646;pointer-events:none;" +
  "overflow:hidden;}" +
  "#wg-swipe-layer .wg-swipe-dot{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;" +
  "border-radius:50%;background:rgba(147,197,253,.55);border:2px solid rgba(255,255,255,.85);" +
  "box-shadow:0 0 12px rgba(59,130,246,.55);opacity:0;}" +
  "#wg-swipe-layer .wg-swipe-finger{position:absolute;width:28px;height:28px;margin:-14px 0 0 -14px;" +
  "border-radius:50%;background:rgba(15,23,42,.92);border:2px solid #fff;" +
  "box-shadow:0 4px 16px rgba(0,0,0,.4);opacity:0;" +
  "transition:left .05s linear,top .05s linear,opacity .15s ease;}" +
  "#wg-swipe-layer .wg-swipe-label{position:absolute;left:50%;top:18%;transform:translateX(-50%);" +
  "padding:6px 12px;border-radius:999px;background:rgba(15,23,42,.88);color:#e0f2fe;" +
  "border:1px solid rgba(56,189,248,.55);font:700 12px/1.2 system-ui,sans-serif;" +
  "letter-spacing:.04em;text-transform:uppercase;opacity:0;transition:opacity .25s ease;}" +
  "#wg-swipe-layer.wg-in .wg-swipe-label{opacity:1;}" +
  "#wg-panel{position:fixed;z-index:2147483647;left:50%;bottom:12px;transform:translateX(-50%);" +
  "max-width:min(92vw,640px);max-height:calc(100vh - 24px);overflow-y:auto;box-sizing:border-box;" +
  "background:rgba(20,10,40,.94);color:#fff;border-radius:14px;" +
  "padding:16px 20px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.35);" +
  // .06s was tuned back when the panel was removed and recreated on
  // EVERY step - fast was the only way to avoid feeling laggy. Now that
  // routine per-step updates reuse the same element (no fade at all - see
  // the panel-reuse fix), this only ever fires for a genuinely fresh DOM
  // (first load, or a real navigation - which is exactly what an episode
  // boundary is). Slower and smoother reads as a real, comfortable
  // transition instead of an instant pop - "eyes friendly," not laggy,
  // since it no longer costs anything on the common case.
  "opacity:0;transition:opacity .35s ease;}" +
  "#wg-panel.wg-in{opacity:1;}" +
  "#wg-panel .wg-auto{margin-top:10px;font:600 13px system-ui,sans-serif;color:#c9a6ff;}" +
  "#wg-panel .wg-autoplay-row{margin-top:8px;}" +
  "#wg-panel .wg-autoplay-row label{display:inline-flex;align-items:center;gap:6px;" +
  "font:12px system-ui,sans-serif;color:#b8a0e0;cursor:pointer;user-select:none;}" +
  "#wg-panel .wg-autoplay-row input{margin:0;cursor:pointer;}" +
  "#wg-panel h3{margin:0 0 8px;font-size:13px;color:#c9a6ff;font-weight:700;" +
  "letter-spacing:.02em;text-transform:uppercase;}" +
  // Sits ABOVE the per-Block "Step i/N" heading - the episode/scenario
  // this Block belongs to, not another block-level label. Only rendered
  // when the chain spec actually named a real Flow (chainFlow tags it via
  // BlockInfo.resetSessionBefore's sibling metadata) - a plain ad hoc
  // block chain shows no episode heading at all.
  "#wg-panel .wg-episode{margin:0 0 6px;font:700 15px system-ui,sans-serif;color:#fff;" +
  "padding-bottom:6px;border-bottom:1px solid rgba(124,58,237,.35);}" +
  // Pace chip - numbers speak in the overlay (2.5x / 4500ms / slow).
  "#wg-panel .wg-pace{display:inline-flex;align-items:center;gap:8px;margin:0 0 10px;" +
  "padding:6px 10px;border-radius:8px;background:rgba(124,58,237,.22);" +
  "border:1px solid rgba(124,58,237,.45);font:600 12px/1.35 system-ui,sans-serif;color:#f0e8ff;}" +
  "#wg-panel .wg-pace-badge{display:inline-block;padding:2px 8px;border-radius:999px;" +
  "background:#7C3AED;color:#fff;font:800 11px/1.2 system-ui,sans-serif;letter-spacing:.04em;" +
  "text-transform:uppercase;}" +
  "#wg-panel .wg-pace[data-pace-kind=slow] .wg-pace-badge," +
  "#wg-panel .wg-pace[data-pace-kind=num-slow] .wg-pace-badge{background:#EAB308;color:#1c1917;}" +
  "#wg-panel .wg-pace[data-pace-kind=fast] .wg-pace-badge," +
  "#wg-panel .wg-pace[data-pace-kind=blitz] .wg-pace-badge{background:#22C55E;color:#052e16;}" +
  "#wg-panel .wg-pace[data-pace-kind=ms] .wg-pace-badge{background:#3B82F6;color:#fff;}" +
  "#wg-panel .wg-narration{margin:0 0 12px;font:italic 14px/1.4 system-ui,sans-serif;color:#f0e8ff;}" +
  // Todo checklist(s) float outside #wg-panel so --mini / Hide never hide them.
  // Multiple docks (one per todoId) are supported - stacked on the same side.
  // Click a dock to slide left <-> right (WAYGRAPH_TODO_POS / --todo-left|right).
  ".wg-todo-dock,#wg-todo-dock{position:fixed;z-index:2147483646;top:72px;left:14px;" +
  "width:min(280px,42vw);max-height:calc(100vh - 100px);overflow:auto;box-sizing:border-box;" +
  "padding:10px 12px;background:rgba(20,10,40,.94);color:#fff;border-radius:12px;" +
  "border:1px solid rgba(124,58,237,.45);box-shadow:0 8px 24px rgba(0,0,0,.35);" +
  "pointer-events:auto;cursor:pointer;" +
  "transition:transform .4s cubic-bezier(.22,1,.36,1),top .35s ease;transform:translateX(0);}" +
  ".wg-todo-dock[data-pos=right],#wg-todo-dock[data-pos=right]{transform:translateX(calc(100vw - 100% - 28px));}" +
  ".wg-todo-dock[data-pos=left],#wg-todo-dock[data-pos=left]{transform:translateX(0);}" +
  ".wg-todo-dock .wg-todos-list,#wg-todo-dock #wg-todos,.wg-todo-dock #wg-todos{list-style:none;margin:0;padding:0;background:transparent;border:none;}" +
  // Video device stage: keep recordVideo size fixed; center a device-sized shell.
  "html.wg-video-device-stage{background:#0b1220 !important;}" +
  "html.wg-video-device-stage body{margin:0 !important;min-height:100vh !important;" +
  "display:flex !important;align-items:center !important;justify-content:center !important;" +
  "background:#0b1220 !important;overflow:hidden !important;}" +
  "#wg-device-shell{flex-shrink:0;overflow:auto;background:#fff;" +
  "border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.08);" +
  "transform-origin:center center;" +
  /* Force radius clip on all corners (Chrome + transform/scale). */
  "-webkit-mask-image:-webkit-radial-gradient(white,black);" +
  "isolation:isolate;" +
  "transition:border-radius .55s cubic-bezier(.22,1,.36,1),box-shadow .55s ease," +
  "transform .55s cubic-bezier(.22,1,.36,1),width .5s ease,height .5s ease,max-width .5s ease,max-height .5s ease;}" +
  "#wg-device-shell.wg-shell-enter{border-radius:0;box-shadow:none;}" +
  "#wg-device-shell.wg-shell-shutter-out{border-radius:0 !important;" +
  "box-shadow:none !important;outline:none !important;border:none !important;}" +
  "#wg-device-shell.wg-shell-desktop-flat{border-radius:0 !important;box-shadow:none !important;" +
  "outline:none !important;border:none !important;-webkit-mask-image:none;}" +
  // Always-on zoom HUD - bottom-right (top-left is crowded: todos + banners).
  "#wg-zoom-badge{position:fixed;z-index:2147483646;bottom:14px;right:14px;" +
  "display:flex;align-items:center;gap:7px;padding:6px 11px 6px 8px;" +
  "border-radius:999px;background:rgba(20,10,40,.94);color:#f0e8ff;" +
  "border:1px solid rgba(250,204,21,.6);box-shadow:0 6px 18px rgba(0,0,0,.4);" +
  "font:700 12px/1.2 system-ui,sans-serif;pointer-events:none;" +
  "opacity:1;transform:translateY(0);}" +
  "#wg-zoom-badge .wg-zoom-ico{width:18px;height:18px;display:flex;align-items:center;justify-content:center;" +
  "border-radius:6px;background:rgba(250,204,21,.22);}" +
  "#wg-zoom-badge .wg-zoom-ico svg{width:14px;height:14px;display:block;}" +
  "#wg-zoom-badge .wg-zoom-val{color:#fde68a;font-variant-numeric:tabular-nums;font-weight:800;min-width:3.2em;}" +
  "#wg-zoom-badge[data-zoomed=\\"1\\"]{border-color:#fbbf24;}" +
  // Typing chip (method fills: username / password / etc.)
  "#wg-typing-badge{position:fixed;z-index:2147483646;bottom:88px;left:50%;transform:translateX(-50%);" +
  "display:flex;align-items:center;gap:8px;padding:8px 14px;" +
  "border-radius:999px;background:rgba(20,10,40,.95);color:#e0f2fe;" +
  "border:1px solid rgba(56,189,248,.55);box-shadow:0 8px 22px rgba(0,0,0,.4);" +
  "font:700 12px/1.2 system-ui,sans-serif;pointer-events:none;" +
  "opacity:0;transition:opacity .2s ease;}" +
  "#wg-typing-badge.wg-in{opacity:1;}" +
  "#wg-typing-badge .wg-ty-dots{letter-spacing:.15em;color:#7dd3fc;}" +
  // Device toast + chip (0.13.2+) - icon toast on fixture change, then compact chip.
  "#wg-device-toast{position:fixed;z-index:2147483647;top:14px;right:14px;" +
  "display:flex;align-items:center;gap:10px;min-width:200px;max-width:min(92vw,320px);" +
  "padding:12px 14px;border-radius:14px;background:rgba(20,10,40,.96);color:#f0e8ff;" +
  "border:1px solid rgba(124,58,237,.55);box-shadow:0 10px 28px rgba(0,0,0,.4);" +
  "font:600 13px/1.35 system-ui,sans-serif;pointer-events:none;" +
  "opacity:0;transform:translateX(18px) scale(.96);" +
  "transition:opacity .35s ease,transform .45s cubic-bezier(.22,1,.36,1);}" +
  "#wg-device-toast.wg-in{opacity:1;transform:translateX(0) scale(1);}" +
  "#wg-device-toast.wg-out{opacity:0;transform:translateX(12px) scale(.98);}" +
  "#wg-device-toast[data-preset=mobile]{border-color:#3B82F6;}" +
  "#wg-device-toast[data-preset=tablet]{border-color:#22C55E;}" +
  "#wg-device-toast[data-preset=desktop]{border-color:#9CA3AF;}" +
  "#wg-device-toast .wg-dev-icon{flex:0 0 auto;width:36px;height:36px;border-radius:10px;" +
  "display:flex;align-items:center;justify-content:center;background:rgba(124,58,237,.28);}" +
  "#wg-device-toast[data-preset=mobile] .wg-dev-icon{background:rgba(59,130,246,.28);}" +
  "#wg-device-toast[data-preset=tablet] .wg-dev-icon{background:rgba(34,197,94,.28);}" +
  "#wg-device-toast[data-preset=desktop] .wg-dev-icon{background:rgba(156,163,175,.28);}" +
  "#wg-device-toast .wg-dev-icon svg{width:22px;height:22px;display:block;}" +
  "#wg-device-toast .wg-dev-copy{flex:1 1 auto;min-width:0;}" +
  "#wg-device-toast .wg-dev-title{font:800 13px/1.2 system-ui,sans-serif;color:#fff;}" +
  "#wg-device-toast .wg-dev-sub{margin-top:3px;font:600 11px/1.3 system-ui,sans-serif;" +
  "color:#c9a6ff;letter-spacing:.02em;}" +
  "#wg-device-badge{position:fixed;z-index:2147483646;top:14px;right:14px;" +
  "display:inline-flex;align-items:center;gap:6px;padding:6px 10px 6px 8px;" +
  "border-radius:999px;background:rgba(20,10,40,.92);color:#f0e8ff;" +
  "border:1px solid rgba(124,58,237,.5);font:700 11px/1.2 system-ui,sans-serif;" +
  "letter-spacing:.04em;text-transform:uppercase;pointer-events:none;" +
  "box-shadow:0 4px 14px rgba(0,0,0,.3);opacity:0;transform:translateY(-4px);" +
  "transition:opacity .3s ease,transform .35s cubic-bezier(.22,1,.36,1);}" +
  "#wg-device-badge.wg-in{opacity:1;transform:translateY(0);}" +
  "#wg-device-badge[data-preset=mobile]{border-color:#3B82F6;}" +
  "#wg-device-badge[data-preset=tablet]{border-color:#22C55E;}" +
  "#wg-device-badge[data-preset=desktop]{border-color:#9CA3AF;}" +
  "#wg-device-badge .wg-dev-icon{width:16px;height:16px;display:flex;align-items:center;justify-content:center;}" +
  "#wg-device-badge .wg-dev-icon svg{width:14px;height:14px;display:block;}" +
  "#wg-device-badge .wg-dev-label{white-space:nowrap;}" +
  "#wg-cursor[data-touch=1]{width:28px;height:28px;}" +
  "#wg-todos,.wg-todos-list{list-style:none;margin:0 0 12px;padding:8px 10px;background:#0f0620;border-radius:8px;" +
  "border:1px solid #3a2a60;}" +
  "#wg-todos li,.wg-todos-list li{display:flex;gap:8px;align-items:flex-start;margin:0 0 6px;font:600 12.5px/1.35 system-ui,sans-serif;}" +
  "#wg-todos li:last-child,.wg-todos-list li:last-child{margin-bottom:0;}" +
  "#wg-todos .wg-todo-mark,.wg-todos-list .wg-todo-mark{flex:0 0 auto;width:1.1em;text-align:center;}" +
  "#wg-todos .wg-todo-done,.wg-todos-list .wg-todo-done{color:#6ee7b7;text-decoration:line-through;opacity:.85;}" +
  "#wg-todos .wg-todo-current,.wg-todos-list .wg-todo-current{color:#fff;}" +
  "#wg-todos .wg-todo-pending,.wg-todos-list .wg-todo-pending{color:#9a7ad1;}" +
  "#wg-todos[data-wg-todo-style=bullets] .wg-todo-pending," +
  "#wg-todos[data-wg-todo-style=bullets] .wg-todo-current," +
  ".wg-todos-list[data-wg-todo-style=bullets] .wg-todo-pending," +
  ".wg-todos-list[data-wg-todo-style=bullets] .wg-todo-current{color:#e8dcff;}" +
  "#wg-todos[data-wg-todo-style=bullets] .wg-todo-mark," +
  ".wg-todos-list[data-wg-todo-style=bullets] .wg-todo-mark{color:#c9a6ff;}" +
  "#wg-progress{height:4px;background:#2a1650;border-radius:2px;margin:0 0 12px;overflow:hidden;}" +
  "#wg-progress-bar{height:100%;background:#7C3AED;border-radius:2px;transition:width .3s ease;}" +
  // A real tab bar for episodes - the currently-active episode reads as
  // active (filled underline, full-brightness text), every other episode
  // reads as inactive (dimmed, no underline) - Dan's own ask: "if episode
  // 1 is active, the episode 2 tab is inactive." Only rendered when the
  // chain spec actually named real Flows (chainFlow tags each via
  // BlockInfo - same gate the "Episode N:" heading already uses); an
  // ad hoc block chain with no episodes shows no tab bar at all.
  "#wg-episodes{display:flex;gap:4px;margin:0 0 10px;border-bottom:1px solid #3a2a60;}" +
  "#wg-episodes .wg-ep-tab{padding:6px 14px 8px;font:600 12px system-ui,sans-serif;" +
  "border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap;}" +
  "#wg-episodes .wg-ep-current{color:#fff;border-bottom-color:#7C3AED;}" +
  "#wg-episodes .wg-ep-done{color:#9a7ad1;}" +
  "#wg-episodes .wg-ep-upcoming{color:#5a4a80;}" +
  // A one-time, gentle signal for "you just entered this episode" - Dan:
  // "i want a clear ui eyes friendly to remind me that i am on next
  // episode." A slow outward glow, not an opacity blink/strobe (that's
  // exactly the kind of flashing that already caused the original
  // complaint) - plays once (no loop), 1.1s, only on the FIRST block of a
  // newly-entered episode, not on every step within it.
  "@keyframes wg-ep-enter{0%{box-shadow:0 0 0 0 rgba(124,58,237,.55);}" +
  "100%{box-shadow:0 0 0 10px rgba(124,58,237,0);}}" +
  "#wg-episodes .wg-ep-entered{border-radius:6px;animation:wg-ep-enter 1.1s ease-out;}" +
  // Block strip: carousel (default) or classic wrap (--full).
  "#wg-modules.wg-modules-carousel{display:flex;flex-wrap:nowrap;gap:8px;margin:0 0 10px;" +
  "overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;" +
  "padding:4px 2px 8px;scrollbar-width:thin;}" +
  "#wg-modules.wg-modules-carousel .wg-mod{flex:0 0 auto;scroll-snap-align:center;" +
  "padding:6px 12px;border-radius:999px;font:600 12px system-ui,sans-serif;}" +
  "#wg-modules.wg-modules-carousel .wg-mod-current{transform:scale(1.06);" +
  "box-shadow:0 0 0 2px rgba(124,58,237,.45);}" +
  "#wg-modules.wg-modules-full{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px;}" +
  "#wg-modules.wg-modules-full .wg-mod{padding:3px 9px;border-radius:6px;font:600 11px system-ui,sans-serif;}" +
  "#wg-modules .wg-mod-done{background:#2a1650;color:#9a7ad1;}" +
  "#wg-modules .wg-mod-current{background:#7C3AED;color:#fff;}" +
  "#wg-modules .wg-mod-upcoming{background:transparent;color:#5a4a80;border:1px solid #3a2a60;}" +
  "#wg-banner{position:fixed;z-index:2147483647;top:14px;max-width:320px;" +
  "background:rgba(20,10,40,.94);color:#fff;border-radius:12px;padding:10px 16px;" +
  "font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 20px rgba(0,0,0,.3);" +
  "border:1px solid rgba(124,58,237,.4);cursor:pointer;user-select:none;}" +
  "#wg-banner[data-pos=left]{left:14px;right:auto;transform:none;}" +
  "#wg-banner[data-pos=center]{left:50%;right:auto;transform:translateX(-50%);}" +
  "#wg-banner[data-pos=right]{right:14px;left:auto;transform:none;}" +
  "#wg-banner .wg-banner-tag{display:block;font-size:10px;font-weight:700;color:#c9a6ff;" +
  "letter-spacing:.05em;text-transform:uppercase;margin-bottom:2px;}" +
  "#wg-panel .wg-key{margin:8px 0;}" +
  // A live, human-readable preview of what's about to be written for this
  // MemKey - Dan: "i want pretty to exist in memkeys too... it shows what
  // input its gonig to be written." Same global Pretty/JSON preference the
  // result display already has (window.__wgPretty) - hidden entirely in
  // JSON mode, since the raw textarea already speaks for itself there.
  "#wg-panel .wg-key-pretty{margin-top:4px;font:12px/1.5 system-ui,sans-serif;" +
  "background:#0f0620;border-radius:6px;padding:6px 8px;}" +
  "#wg-panel .wg-key-pretty-row{color:#f0e8ff;}" +
  "#wg-panel .wg-key-pretty-label{color:#9a7ad1;font-weight:600;}" +
  "#wg-panel label{display:block;font-size:12px;color:#d8c8ff;margin-bottom:3px;}" +
  "#wg-panel textarea{width:100%;box-sizing:border-box;background:#0f0620;color:#fff;" +
  "border:1px solid #4b2a80;border-radius:8px;padding:6px 8px;font:12px/1.3 monospace;resize:vertical;}" +
  "#wg-panel button{margin-top:10px;background:#7C3AED;color:#fff;border:none;border-radius:8px;" +
  "padding:8px 16px;font:600 13px system-ui,sans-serif;cursor:pointer;}" +
  "#wg-panel button:hover{background:#6b2fd6;}" +
  "#wg-panel button:disabled{background:#4b2a80;cursor:default;opacity:.7;}" +
  "#wg-panel textarea:disabled{opacity:.6;}" +
  "#wg-panel .wg-result{font:12px/1.4 monospace;background:#0f0620;border-radius:8px;padding:8px;" +
  "margin:8px 0;white-space:pre-wrap;}" +
  "#wg-panel .wg-result-pretty{font:600 14px/1.4 system-ui,sans-serif;}" +
  "#wg-panel .wg-toggle{display:flex;gap:4px;margin:0 0 4px;}" +
  "#wg-panel .wg-toggle button{margin:0;padding:3px 10px;font:600 11px system-ui,sans-serif;" +
  "background:transparent;border:1px solid #4b2a80;color:#9a7ad1;border-radius:6px;}" +
  "#wg-panel .wg-toggle button.wg-active{background:#4b2a80;color:#fff;}" +
  "#wg-panel.wg-error{border:1.5px solid #e0475c;}" +
  "#wg-panel .wg-error-heading{color:#ff8fa0;}" +
  "#wg-panel .wg-error-msg{font:12px/1.5 monospace;background:#2a0f16;color:#ffc7cf;" +
  "border-radius:8px;padding:10px;margin:0 0 12px;white-space:pre-wrap;max-height:200px;overflow-y:auto;}" +
  "#wg-panel .wg-error-actions{display:flex;gap:8px;}" +
  "#wg-panel .wg-error-stop{background:#e0475c;margin-top:0;}" +
  "#wg-panel .wg-error-stop:hover{background:#c33a4c;}" +
  "#wg-panel .wg-error-retry{background:#2a9d6f;margin-top:0;}" +
  "#wg-panel .wg-error-retry:hover{background:#22855e;}" +
  "#wg-panel.wg-expected{border:1.5px solid #e0a53e;}" +
  "#wg-panel .wg-expected-heading{color:#ffcf7a;}" +
  "#wg-panel .wg-expected-reason{font:600 12.5px/1.5 system-ui,sans-serif;background:#2a2410;" +
  "color:#ffe6ae;border-radius:8px;padding:10px;margin:0 0 8px;}" +
  // Hide / Show chrome: collapsed = compact "N / M · block" pill + Next (manual).
  "#wg-panel .wg-chrome{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px;}" +
  "#wg-panel .wg-chrome-title{font:700 11px/1.2 system-ui,sans-serif;color:#c9a6ff;" +
  "letter-spacing:.04em;text-transform:uppercase;flex:1;min-width:0;}" +
  "#wg-panel .wg-chrome-actions{display:flex;align-items:center;gap:6px;flex-shrink:0;}" +
  "#wg-panel button.wg-hide-btn,#wg-panel button.wg-mini-next{margin:0;padding:4px 10px;font:600 11px system-ui,sans-serif;" +
  "background:#3a2a60;color:#e8dcff;border:1px solid #5b3aa8;border-radius:6px;cursor:pointer;}" +
  "#wg-panel button.wg-hide-btn:hover,#wg-panel button.wg-mini-next:hover{background:#4b2a80;}" +
  "#wg-panel button.wg-mini-next{background:#2a9d6f;border-color:#22855e;color:#fff;display:none;}" +
  "#wg-panel button.wg-mini-next:hover{background:#22855e;}" +
  "#wg-panel button.wg-mini-next:disabled{opacity:.55;cursor:default;}" +
  "#wg-panel.wg-collapsed{width:auto;max-width:92vw;padding:8px 12px;max-height:none;overflow:hidden;}" +
  "#wg-panel.wg-collapsed .wg-body{display:none;}" +
  "#wg-panel.wg-collapsed .wg-chrome{margin:0;}" +
  "#wg-panel.wg-collapsed .wg-chrome-title{font:700 13px/1.25 system-ui,sans-serif;color:#fff;" +
  "letter-spacing:0;text-transform:none;}" +
  "#wg-panel.wg-collapsed button.wg-mini-next.wg-mini-next-show{display:inline-block;}" +
  "@media (max-width:640px){" +
  "#wg-panel{left:8px;right:8px;bottom:8px;transform:none;max-width:none;width:auto;" +
  "max-height:min(55vh,calc(100vh - 16px));padding:12px 14px;border-radius:12px;}" +
  "#wg-panel.wg-collapsed{left:50%;right:auto;transform:translateX(-50%);width:auto;}" +
  "#wg-episodes{overflow-x:auto;-webkit-overflow-scrolling:touch;flex-wrap:nowrap;}" +
  "#wg-panel .wg-narration{font-size:13px;}" +
  "#wg-panel button{width:100%;}" +
  "#wg-panel.wg-collapsed button.wg-mini-next,#wg-panel.wg-collapsed button.wg-hide-btn{width:auto;}" +
  "#wg-panel .wg-error-actions{flex-direction:column;}" +
  "#wg-banner{max-width:min(92vw,320px);font-size:13px;}" +
  "}";

// Purple dot favicon (matches the overlay's own theme color) - the tab-bar
// signal that "this Chromium window is a waygraph run," even at a glance
// across a taskbar/alt-tab, not just something visible inside the page.
const WAYGRAPH_FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>" +
      "<circle cx='16' cy='16' r='14' fill='#7C3AED'/></svg>",
  );

async function installOverlay(page, title) {
  await page.addStyleTag({ content: RING_CSS }).catch(() => {});
  // Default top-left; override with WAYGRAPH_TITLE_POS=left|center|right.
  // Click cycles left -> center -> right (persisted in localStorage so a
  // navigation that rebuilds the banner keeps the human's last pick).
  const envPos = (process.env.WAYGRAPH_TITLE_POS || "left").toLowerCase();
  const bannerPos = envPos === "center" || envPos === "right" ? envPos : "left";
  const envTodoPos = (process.env.WAYGRAPH_TODO_POS || "left").toLowerCase();
  const todoPos = envTodoPos === "right" ? "right" : "left";
  const envAutoplay = process.env.WAYGRAPH_AUTOPLAY === "1";
  await page
    .evaluate(
      ({ title, favicon, bannerPos, todoPos, envAutoplay }) => {
        // Seed the live autoplay toggle from the env default on first ever
        // load only - a real navigation re-runs this, and re-stamping here
        // would silently undo a human's mid-run checkbox click.
        try {
          if (localStorage.getItem("wg-autoplay") === null) {
            localStorage.setItem("wg-autoplay", envAutoplay ? "1" : "0");
          }
        } catch {
          /* private mode / blocked storage - falls back to manual gating */
        }
        if (!document.getElementById("wg-ring")) {
          const ring = document.createElement("div");
          ring.id = "wg-ring";
          document.documentElement.appendChild(ring);
        }
        if (!document.getElementById("wg-ring-label")) {
          const ringLabel = document.createElement("div");
          ringLabel.id = "wg-ring-label";
          document.documentElement.appendChild(ringLabel);
        }
        if (!document.getElementById("wg-cursor")) {
          const cursor = document.createElement("div");
          cursor.id = "wg-cursor";
          // Dark fill + white stroke, same as help-center-clip-engine's own
          // #clip-cursor - visible against any page background, light or
          // dark, unlike a plain solid-white shape.
          cursor.innerHTML =
            "<svg viewBox='0 0 32 32' width='24' height='24'>" +
            "<path fill='#0C0C1A' stroke='#fff' stroke-width='1.4' stroke-linejoin='round' " +
            "d='M6 3.5l1.4 22.5 5.8-5.4 4.2 9.4 3.6-1.6-4.2-9.2H26z'/></svg>";
          document.documentElement.appendChild(cursor);
        }
        if (!document.getElementById("wg-click-pulse")) {
          const pulse = document.createElement("div");
          pulse.id = "wg-click-pulse";
          document.documentElement.appendChild(pulse);
        }
        window.__wgMoveCursorTo = (x, y, ms, instant) => {
          const cursor = document.getElementById("wg-cursor");
          if (!cursor) return;
          cursor.style.setProperty("--wg-cursor-ms", (ms || 600) + "ms");
          if (instant) {
            const prev = cursor.style.transition;
            cursor.style.transition = "none";
            cursor.style.transform = "translate(" + x + "px," + y + "px)";
            void cursor.offsetWidth;
            cursor.style.transition = prev || "";
          } else {
            cursor.style.transform = "translate(" + x + "px," + y + "px)";
          }
          cursor.style.opacity = "1";
        };
        window.__wgHideCursor = () => {
          const cursor = document.getElementById("wg-cursor");
          if (cursor) cursor.style.opacity = "0";
        };
        window.__wgPositionRing = (box, label, tone, style) => {
          const ring = document.getElementById("wg-ring");
          const ringLabel = document.getElementById("wg-ring-label");
          if (!ring || !ringLabel || !box) return;
          const raw = (tone || "planned") + "";
          const t =
            raw === "auto" || raw === "info" || raw === "warning" || raw === "danger" || raw === "success"
              ? raw
              : "planned";
          const st = style && typeof style === "object" ? style : {};
          const sizeRaw = (st.size || "md") + "";
          const size =
            sizeRaw === "sm" || sizeRaw === "lg" ? sizeRaw : "md";
          const weightRaw = (st.weight || "normal") + "";
          const weight = weightRaw === "bold" ? "bold" : "normal";
          ring.dataset.tone = t;
          ringLabel.dataset.tone = t;
          ring.dataset.size = size;
          ringLabel.dataset.size = size;
          ringLabel.dataset.weight = weight;
          const pad = size === "sm" ? 3 : size === "lg" ? 10 : 6;
          const margin = 6;
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          // Pin ring EXACTLY to the element - never clamp the ring away from
          // the target (that looked "strapped on" the viewport).
          const left = box.x - pad;
          const top = box.y - pad;
          const width = Math.max(4, box.width + pad * 2);
          const height = Math.max(4, box.height + pad * 2);
          ring.style.left = left + "px";
          ring.style.top = top + "px";
          ring.style.width = width + "px";
          ring.style.height = height + "px";
          ring.style.opacity = "1";
          ringLabel.textContent = label || "";
          ringLabel.style.opacity = "1";
          const lw = ringLabel.offsetWidth;
          const lh = ringLabel.offsetHeight;
          let labelLeft = left;
          let labelTop = top + height + 8;
          if (labelTop + lh > vh - margin) labelTop = top - lh - 8;
          if (labelTop < margin) labelTop = margin;
          if (labelLeft + lw > vw - margin) labelLeft = Math.max(margin, vw - margin - lw);
          if (labelLeft < margin) labelLeft = margin;
          ringLabel.style.left = labelLeft + "px";
          ringLabel.style.top = labelTop + "px";
        };
        /** Live-follow a selector with rAF (accurate under device shell scale). */
        window.__wgStopRingFollow = () => {
          if (window.__wgRingFollowRaf) {
            cancelAnimationFrame(window.__wgRingFollowRaf);
            window.__wgRingFollowRaf = 0;
          }
          window.__wgRingFollowSel = "";
        };
        window.__wgFollowRing = (sel, label, tone, style, focus) => {
          window.__wgStopRingFollow();
          if (!sel) return;
          window.__wgRingFollowSel = sel;
          const tick = () => {
            if (window.__wgRingFollowSel !== sel) return;
            const el = document.querySelector(sel);
            if (!el) {
              window.__wgRingFollowRaf = requestAnimationFrame(tick);
              return;
            }
            const r = el.getBoundingClientRect();
            const box = { x: r.x, y: r.y, width: r.width, height: r.height };
            if (window.__wgPositionRing) {
              window.__wgPositionRing(box, label, tone || "planned", style || {});
            }
            if (focus && window.__wgApplyFocus) window.__wgApplyFocus(box);
            window.__wgRingFollowRaf = requestAnimationFrame(tick);
          };
          tick();
        };
        window.__wgClickPulse = (x, y, tone) => {
          const pulse = document.getElementById("wg-click-pulse");
          if (!pulse) return;
          const raw = (tone || "planned") + "";
          pulse.dataset.tone =
            raw === "auto" || raw === "info" || raw === "warning" || raw === "danger" || raw === "success"
              ? raw
              : "planned";
          pulse.style.left = x + "px";
          pulse.style.top = y + "px";
          pulse.classList.remove("wg-pulse");
          void pulse.offsetWidth;
          pulse.classList.add("wg-pulse");
        };
        window.__wgHideRing = (opts) => {
          // While a narrate() call owns the ring (mid multi-step action),
          // the auto-highlight click/fill patches' own end-of-step hide is
          // a no-op - narrate() itself clears it once the WHOLE wrapped
          // action finishes, not just its first sub-step.
          if (window.__wgNarrateOwnsRing) return;
          if (window.__wgStopRingFollow) window.__wgStopRingFollow();
          const ring = document.getElementById("wg-ring");
          const ringLabel = document.getElementById("wg-ring-label");
          if (ring) ring.style.opacity = "0";
          if (ringLabel) ringLabel.style.opacity = "0";
          if (window.__wgClearFocus) window.__wgClearFocus();
          // Honor zoomOut:false - keep camera until next zoom / desktop clear.
          const forceClear = opts && opts.clearZoom === true;
          const skipClear = opts && opts.clearZoom === false;
          if (
            !skipClear &&
            (forceClear || window.__wgZoomOutOnHide !== false) &&
            window.__wgClearZoom
          ) {
            window.__wgClearZoom();
          }
        };
        window.__wgClearFocus = () => {
          const veil = document.getElementById("wg-focus-veil");
          if (!veil) return;
          veil.classList.remove("wg-in");
          setTimeout(() => {
            const v = document.getElementById("wg-focus-veil");
            if (v && !v.classList.contains("wg-in")) v.remove();
          }, 320);
        };
        window.__wgApplyFocus = (box) => {
          if (!box) {
            if (window.__wgClearFocus) window.__wgClearFocus();
            return;
          }
          let veil = document.getElementById("wg-focus-veil");
          if (!veil) {
            veil = document.createElement("div");
            veil.id = "wg-focus-veil";
            veil.setAttribute("data-wg-ui", "1");
            document.documentElement.appendChild(veil);
          }
          const pad = 10;
          veil.style.left = Math.max(0, box.x - pad) + "px";
          veil.style.top = Math.max(0, box.y - pad) + "px";
          veil.style.width = Math.max(8, box.width + pad * 2) + "px";
          veil.style.height = Math.max(8, box.height + pad * 2) + "px";
          void veil.offsetWidth;
          veil.classList.add("wg-in");
        };
        /**
         * Finger swipe trail for touch theater (orientation rotate / device change).
         * opts: { dir: 'left'|'right'|'up'|'down', label?, ms? }
         * Returns duration waited (ms) via Promise when called from page.evaluate async.
         */
        window.__wgSwipeTrail = (opts) => {
          const o = opts || {};
          const dir = o.dir === "right" || o.dir === "up" || o.dir === "down" ? o.dir : "left";
          const ms = Math.max(280, Math.min(1400, Number(o.ms) || 720));
          const label =
            o.label ||
            (dir === "left" || dir === "right" ? "swipe" : "swipe") +
              (o.hint ? " \\u00b7 " + o.hint : "");
          let layer = document.getElementById("wg-swipe-layer");
          if (layer && layer._wgTimer) {
            clearTimeout(layer._wgTimer);
            layer._wgTimer = null;
          }
          if (layer) layer.remove();
          layer = document.createElement("div");
          layer.id = "wg-swipe-layer";
          layer.setAttribute("data-wg-ui", "1");
          const finger = document.createElement("div");
          finger.className = "wg-swipe-finger";
          const lab = document.createElement("div");
          lab.className = "wg-swipe-label";
          lab.textContent = label;
          layer.appendChild(lab);
          layer.appendChild(finger);
          document.documentElement.appendChild(layer);
          const vw = window.innerWidth || 390;
          const vh = window.innerHeight || 844;
          const pad = Math.min(vw, vh) * 0.18;
          let x0;
          let y0;
          let x1;
          let y1;
          if (dir === "left") {
            x0 = vw - pad;
            x1 = pad;
            y0 = y1 = vh * 0.52;
          } else if (dir === "right") {
            x0 = pad;
            x1 = vw - pad;
            y0 = y1 = vh * 0.52;
          } else if (dir === "up") {
            x0 = x1 = vw * 0.5;
            y0 = vh - pad;
            y1 = pad;
          } else {
            x0 = x1 = vw * 0.5;
            y0 = pad;
            y1 = vh - pad;
          }
          finger.style.left = x0 + "px";
          finger.style.top = y0 + "px";
          finger.style.opacity = "1";
          void layer.offsetWidth;
          layer.classList.add("wg-in");
          const steps = 12;
          const stepMs = Math.floor(ms / steps);
          let i = 0;
          const tick = () => {
            i += 1;
            const t = Math.min(1, i / steps);
            const e = t * t * (3 - 2 * t);
            const x = x0 + (x1 - x0) * e;
            const y = y0 + (y1 - y0) * e;
            finger.style.left = x + "px";
            finger.style.top = y + "px";
            const dot = document.createElement("div");
            dot.className = "wg-swipe-dot";
            dot.style.left = x + "px";
            dot.style.top = y + "px";
            dot.style.opacity = String(0.85 - t * 0.55);
            layer.appendChild(dot);
            requestAnimationFrame(() => {
              dot.style.transition = "opacity .45s ease, transform .45s ease";
              dot.style.opacity = "0";
              dot.style.transform = "scale(1.8)";
            });
            if (i < steps) {
              layer._wgTimer = setTimeout(tick, stepMs);
            } else {
              finger.style.opacity = "0";
              layer.classList.remove("wg-in");
              layer._wgTimer = setTimeout(() => {
                const el = document.getElementById("wg-swipe-layer");
                if (el) el.remove();
              }, 380);
            }
          };
          layer._wgTimer = setTimeout(tick, 40);
          return ms + 120;
        };
        window.__wgClearZoom = () => {
          // Strip leftover element transforms from older zoom path.
          document.querySelectorAll("[data-wg-zoomed=\\"1\\"]").forEach((el) => {
            el.style.removeProperty("transform");
            el.style.removeProperty("transform-origin");
            el.style.removeProperty("transition");
            el.style.removeProperty("z-index");
            el.style.removeProperty("position");
            delete el.dataset.wgZoomed;
          });
          // Undo any prior shell-camera experiment - restore device fit scale only.
          const shell = document.getElementById("wg-device-shell");
          if (shell && shell.dataset.wgCamBase != null) {
            shell.style.transform = shell.dataset.wgCamBase;
            if (shell.dataset.wgCamOrigin) {
              shell.style.transformOrigin = shell.dataset.wgCamOrigin;
            } else {
              shell.style.transformOrigin = "center center";
            }
            delete shell.dataset.wgCamBase;
            delete shell.dataset.wgCamOrigin;
            delete shell.dataset.wgCamZoom;
          }
          window.__wgZoomLevel = 1;
          window.__wgZoomSel = "";
          if (window.__wgSetZoomBadge) window.__wgSetZoomBadge(1, "");
        };
        const ZOOM_ICO =
          '<svg viewBox="0 0 24 24" fill="none" stroke="#fde68a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
        window.__wgSetZoomBadge = (scale, sel) => {
          const n = Number(scale);
          const level = Number.isFinite(n) && n > 0 ? n : 1;
          let badge = document.getElementById("wg-zoom-badge");
          if (!badge) {
            badge = document.createElement("div");
            badge.id = "wg-zoom-badge";
            badge.setAttribute("data-wg-ui", "1");
            document.documentElement.appendChild(badge);
          }
          const zoomed = level > 1.001 || level < 0.999;
          badge.dataset.zoomed = zoomed ? "1" : "0";
          const txt = level.toFixed(2) + "\\u00d7";
          badge.innerHTML =
            '<span class="wg-zoom-ico">' +
            ZOOM_ICO +
            '</span><span class="wg-zoom-val">' +
            txt +
            "</span>";
          badge.classList.add("wg-in");
          window.__wgZoomLevel = level;
          window.__wgZoomSel = sel || "";
        };
        window.__wgEnsureZoomBadge = () => {
          if (window.__wgSetZoomBadge) {
            window.__wgSetZoomBadge(window.__wgZoomLevel || 1, window.__wgZoomSel || "");
          }
        };
        window.__wgSetTypingBadge = (on, label) => {
          let badge = document.getElementById("wg-typing-badge");
          if (!on) {
            if (badge) {
              badge.classList.remove("wg-in");
              setTimeout(() => {
                const b = document.getElementById("wg-typing-badge");
                if (b && !b.classList.contains("wg-in")) b.remove();
              }, 220);
            }
            return;
          }
          if (!badge) {
            badge = document.createElement("div");
            badge.id = "wg-typing-badge";
            badge.setAttribute("data-wg-ui", "1");
            document.documentElement.appendChild(badge);
          }
          const text = label ? String(label).slice(0, 40) : "typing";
          badge.innerHTML =
            '<span class="wg-ty-dots">\\u25cf\\u25cf\\u25cf</span><span>typing \\u00b7 ' +
            text.replace(/</g, "&lt;") +
            "</span>";
          void badge.offsetWidth;
          badge.classList.add("wg-in");
        };
        /**
         * Zoom HUD only - never CSS-scale the target or the device shell.
         * Shell camera zoom fought device-theater fit-scale (broke ring follow
         * + uneven border-radius). Element scale mangled cart rows. Emphasis
         * is ring + focus veil; badge still shows authored zoom level.
         */
        window.__wgApplyZoom = (sel, scale) => {
          document.querySelectorAll("[data-wg-zoomed=\\"1\\"]").forEach((el) => {
            el.style.removeProperty("transform");
            el.style.removeProperty("transform-origin");
            el.style.removeProperty("transition");
            el.style.removeProperty("z-index");
            el.style.removeProperty("position");
            delete el.dataset.wgZoomed;
          });
          const shell = document.getElementById("wg-device-shell");
          if (shell && shell.dataset.wgCamBase != null) {
            shell.style.transform = shell.dataset.wgCamBase;
            shell.style.transformOrigin = shell.dataset.wgCamOrigin || "center center";
            delete shell.dataset.wgCamBase;
            delete shell.dataset.wgCamOrigin;
            delete shell.dataset.wgCamZoom;
          }
          const n = Number(scale);
          if (!Number.isFinite(n) || n <= 1.001) {
            window.__wgZoomLevel = 1;
            window.__wgZoomSel = "";
            if (window.__wgSetZoomBadge) window.__wgSetZoomBadge(1, "");
            return;
          }
          window.__wgZoomLevel = n;
          window.__wgZoomSel = sel || "";
          if (window.__wgSetZoomBadge) window.__wgSetZoomBadge(n, sel || "");
        };
        // Mount zoom HUD immediately so demos always show 1.00x.
        if (window.__wgEnsureZoomBadge) window.__wgEnsureZoomBadge();
        const POSITIONS = ["left", "center", "right"];
        const applyPos = (el, pos) => {
          el.dataset.pos = pos;
          try {
            localStorage.setItem("wg-banner-pos", pos);
          } catch {
            /* private mode / blocked storage - position still applies this page */
          }
        };
        if (title) {
          let banner = document.getElementById("wg-banner");
          if (!banner) {
            banner = document.createElement("div");
            banner.id = "wg-banner";
            let saved = null;
            try {
              saved = localStorage.getItem("wg-banner-pos");
            } catch {
              /* ignore */
            }
            const startPos =
              saved && POSITIONS.includes(saved) ? saved : bannerPos;
            applyPos(banner, startPos);
            banner.title = "Click to move: top left / center / right";
            banner.addEventListener("click", (e) => {
              e.stopPropagation();
              const i = POSITIONS.indexOf(banner.dataset.pos || "left");
              applyPos(banner, POSITIONS[(i + 1) % POSITIONS.length]);
            });
            const tag = document.createElement("span");
            tag.className = "wg-banner-tag";
            tag.textContent = "waygraph demo";
            const text = document.createElement("span");
            text.className = "wg-banner-text";
            text.textContent = title;
            banner.appendChild(tag);
            banner.appendChild(text);
            document.documentElement.appendChild(banner);
          } else {
            // Fixture / episode title changes every step - update in place
            // (banner is created once; do not leave the first step's text stuck).
            let text = banner.querySelector(".wg-banner-text");
            if (!text) {
              text = document.createElement("span");
              text.className = "wg-banner-text";
              banner.appendChild(text);
            }
            text.textContent = title;
          }
        }
        // Tab title/favicon: a real navigation resets document.title and any
        // <link rel="icon"> the new document brings, so re-check (not
        // re-append) on every call instead of a one-time flag.
        if (!document.title.startsWith("[waygraph] ")) {
          document.title = "[waygraph] " + document.title;
        }
        let iconLink = document.querySelector("link[rel~='icon']");
        if (!iconLink) {
          iconLink = document.createElement("link");
          iconLink.rel = "icon";
          document.head.appendChild(iconLink);
        }
        if (iconLink.href !== favicon) iconLink.href = favicon;
        // Blind-agent overlay beacons: every modal root gets data-wg-ui /
        // data-wg-modal / data-wg-ready so tests can fail on a blank panel.
        window.__wgStampModal = (el, kind, meta) => {
          if (!el) return;
          meta = meta || {};
          el.setAttribute("data-wg-ui", "1");
          el.setAttribute("data-wg-modal", kind || "panel");
          if (meta.phase != null) el.setAttribute("data-wg-phase", String(meta.phase));
          if (meta.step != null) el.setAttribute("data-wg-step", String(meta.step));
          if (meta.total != null) el.setAttribute("data-wg-total", String(meta.total));
          if (meta.block != null) el.setAttribute("data-wg-block", String(meta.block));
          el.setAttribute(
            "data-wg-collapsed",
            el.classList.contains("wg-collapsed") ? "1" : "0",
          );
          el.setAttribute("data-wg-ready", meta.ready === false ? "0" : "1");
        };
        window.__wgOverlayBeacon = () => {
          return Array.from(document.querySelectorAll("[data-wg-ui=\\"1\\"]")).map((el) => {
            const r = el.getBoundingClientRect();
            const st = getComputedStyle(el);
            return {
              id: el.id || null,
              modal: el.getAttribute("data-wg-modal"),
              ready: el.getAttribute("data-wg-ready") === "1",
              phase: el.getAttribute("data-wg-phase"),
              step: el.getAttribute("data-wg-step"),
              block: el.getAttribute("data-wg-block"),
              collapsed:
                el.getAttribute("data-wg-collapsed") === "1" ||
                el.classList.contains("wg-collapsed"),
              opacity: st.opacity,
              textLen: (el.innerText || "").trim().length,
              w: Math.round(r.width),
              h: Math.round(r.height),
              visible: r.width > 0 && r.height > 0 && Number(st.opacity) > 0.05,
            };
          });
        };
        const existingBanner = document.getElementById("wg-banner");
        if (existingBanner) window.__wgStampModal(existingBanner, "banner", { ready: true });
        // Hide/Show for #wg-panel - call after every panel.innerHTML refresh.
        // Collapsed = "N / M · block" + Next (when not auto). Never pass
        // forceCollapsed:false - omit so Hide/localStorage wins.
        window.__wgWirePanelChrome = (panel, storageKey, chromeTitle, opts) => {
          if (!panel) return;
          opts = opts || {};
          const ensureChrome = () => {
            let chrome = panel.querySelector(":scope > .wg-chrome");
            if (!chrome) {
              const body = document.createElement("div");
              body.className = "wg-body";
              while (panel.firstChild) body.appendChild(panel.firstChild);
              chrome = document.createElement("div");
              chrome.className = "wg-chrome";
              const titleEl = document.createElement("span");
              titleEl.className = "wg-chrome-title";
              titleEl.textContent = chromeTitle || "waygraph demo";
              const actions = document.createElement("div");
              actions.className = "wg-chrome-actions";
              const nextBtn = document.createElement("button");
              nextBtn.type = "button";
              nextBtn.className = "wg-mini-next";
              nextBtn.setAttribute("data-wg-mini-next", "1");
              nextBtn.textContent = "Next \u25B6";
              const btn = document.createElement("button");
              btn.type = "button";
              btn.className = "wg-hide-btn";
              btn.setAttribute("data-wg-toggle", "1");
              btn.textContent = "Hide";
              actions.appendChild(nextBtn);
              actions.appendChild(btn);
              chrome.appendChild(titleEl);
              chrome.appendChild(actions);
              panel.appendChild(chrome);
              panel.appendChild(body);
              return;
            }
            // Yap slides ship a bare chrome - ensure actions + mini Next exist.
            let actions = chrome.querySelector(".wg-chrome-actions");
            if (!actions) {
              actions = document.createElement("div");
              actions.className = "wg-chrome-actions";
              const hide = chrome.querySelector("[data-wg-toggle]");
              if (hide) actions.appendChild(hide);
              chrome.appendChild(actions);
            }
            if (!actions.querySelector("[data-wg-mini-next]")) {
              const nextBtn = document.createElement("button");
              nextBtn.type = "button";
              nextBtn.className = "wg-mini-next";
              nextBtn.setAttribute("data-wg-mini-next", "1");
              nextBtn.textContent = "Next \u25B6";
              actions.insertBefore(nextBtn, actions.firstChild);
            }
          };
          ensureChrome();
          const stepLabel = opts.stepLabel || panel.dataset.wgStepLabel || "";
          if (stepLabel) panel.dataset.wgStepLabel = stepLabel;
          const syncMiniNext = (hidden) => {
            const miniNext = panel.querySelector("[data-wg-mini-next]");
            if (!miniNext) return;
            let auto = false;
            try {
              auto = localStorage.getItem("wg-autoplay") === "1";
            } catch {
              /* ignore */
            }
            const runBtn = document.getElementById("wg-run");
            const show = !!hidden && !auto && !!runBtn;
            miniNext.classList.toggle("wg-mini-next-show", show);
            if (runBtn) {
              miniNext.textContent = runBtn.textContent || "Next \u25B6";
              miniNext.disabled = !!runBtn.disabled;
            } else {
              miniNext.disabled = true;
            }
          };
          const apply = (hidden, persist) => {
            panel.classList.toggle("wg-collapsed", hidden);
            panel.setAttribute("data-wg-collapsed", hidden ? "1" : "0");
            const t = panel.querySelector("[data-wg-toggle]");
            const titleEl = panel.querySelector(".wg-chrome-title");
            const label = panel.dataset.wgStepLabel || stepLabel;
            if (titleEl) {
              titleEl.textContent = hidden
                ? (label || chromeTitle || "waygraph demo")
                : (chromeTitle || "waygraph demo");
            }
            if (t) t.textContent = hidden ? "Show" : "Hide";
            syncMiniNext(hidden);
            if (persist !== false) {
              try {
                localStorage.setItem(storageKey, hidden ? "1" : "0");
              } catch {
                /* private mode */
              }
            }
          };
          let hidden = false;
          if (opts.forceCollapsed === true) {
            hidden = true;
          } else {
            try {
              hidden = localStorage.getItem(storageKey) === "1";
            } catch {
              /* ignore */
            }
          }
          // force mini does not overwrite Hide preference in storage.
          apply(hidden, opts.forceCollapsed === true ? false : true);
          const toggle = panel.querySelector("[data-wg-toggle]");
          if (toggle && !toggle.dataset.wgWired) {
            toggle.dataset.wgWired = "1";
            toggle.addEventListener("click", (e) => {
              e.stopPropagation();
              apply(!panel.classList.contains("wg-collapsed"), true);
            });
          }
          const miniNext = panel.querySelector("[data-wg-mini-next]");
          if (miniNext && !miniNext.dataset.wgWired) {
            miniNext.dataset.wgWired = "1";
            miniNext.addEventListener("click", (e) => {
              e.stopPropagation();
              const runBtn = document.getElementById("wg-run");
              if (runBtn && !runBtn.disabled) {
                runBtn.click();
                return;
              }
              if (typeof window.__wgNext === "function") window.__wgNext({});
            });
          }
          const autoCb = document.getElementById("wg-autoplay-cb");
          if (autoCb && !autoCb.dataset.wgMiniWired) {
            autoCb.dataset.wgMiniWired = "1";
            autoCb.addEventListener("change", () => {
              syncMiniNext(panel.classList.contains("wg-collapsed"));
            });
          }
          const cur = panel.querySelector("#wg-modules .wg-mod-current");
          if (cur && typeof cur.scrollIntoView === "function") {
            try {
              cur.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
            } catch {
              cur.scrollIntoView(false);
            }
          }
        };
        // Floating todo dock - lives outside #wg-panel so --mini / Hide never
        // hide the checklist. Click cycles left <-> right with CSS transform.
        // Authors set side via ctx.todoPos("left"|"right"); env / --todo-* fallback.
        // Payload:
        //   { sync: "clear" }                         -> remove dock
        //   { sync: "keep" }                          -> leave dock alone (no wipe)
        //   { sync: "set", dock } / { sync:"set", list } -> render / recreate
        // Compat: bare array = set list (empty array = clear - legacy only).
        window.__wgSyncTodos = (payload, pos) => {
          let sync = "set";
          let list = [];
          let dockState = null;
          let wantPos =
            pos === "left" || pos === "right" ? pos : null;
          if (Array.isArray(payload)) {
            list = payload;
            sync = list.length ? "set" : "clear";
          } else if (payload && typeof payload === "object") {
            sync = payload.sync === "clear" || payload.sync === "keep" ? payload.sync : "set";
            dockState = payload.dock || null;
            if (payload.pos === "left" || payload.pos === "right") wantPos = payload.pos;
            if (Array.isArray(payload.list)) list = payload.list;
            else if (dockState && Array.isArray(dockState.groups)) {
              // Flatten for legacy callers; full dock rendered below when present.
              list = [];
              for (const g of dockState.groups) {
                if (g && Array.isArray(g.items)) list = list.concat(g.items);
              }
            }
          } else {
            list = [];
            sync = "clear";
          }

          let dockKey =
            (dockState && dockState.id && String(dockState.id).trim()) ||
            (payload && !Array.isArray(payload) && payload.todoId && String(payload.todoId).trim()) ||
            "_default";

          // Drop any in-panel leftover (old builds put #wg-todos in .wg-body).
          document.querySelectorAll("#wg-panel #wg-todos").forEach((el) => el.remove());

          const allDocks = () =>
            [...document.querySelectorAll(".wg-todo-dock, #wg-todo-dock")].filter(
              (el, i, arr) => arr.indexOf(el) === i,
            );
          const relayoutTodoDocks = () => {
            const docks = allDocks();
            let top = 72;
            for (const el of docks) {
              el.style.top = top + "px";
              top += Math.max(48, el.getBoundingClientRect().height) + 10;
            }
          };
          const findDock = (key) => {
            if (key === "_default") {
              return (
                document.querySelector('.wg-todo-dock[data-wg-todo-key="_default"]') ||
                document.getElementById("wg-todo-dock")
              );
            }
            const all = document.querySelectorAll(".wg-todo-dock");
            for (let i = 0; i < all.length; i++) {
              if (all[i].getAttribute("data-wg-todo-key") === String(key)) return all[i];
            }
            return null;
          };

          // keep + no new payload: do not remove existing docks (PIA #10).
          if (sync === "keep") {
            if (!dockState && !list.length) return;
            // After navigation the DOM may be gone - recreate from carried dock.
            sync = "set";
          }
          // Default replace=true: one checklist. parallel docks only when replace:false.
          const replace =
            !(payload && !Array.isArray(payload) && payload.replace === false) &&
            !(payload && !Array.isArray(payload) && payload.parallel === true);
          const hasDock =
            !!(dockState && Array.isArray(dockState.groups) && dockState.groups.length);
          // Explicit clear only - never treat "set + dock + empty list" as clear
          // (that thrash was marks -> blank in a few ms).
          if (sync === "clear" || (sync === "set" && !hasDock && !list.length)) {
            const clearId =
              (payload && !Array.isArray(payload) && payload.todoId && String(payload.todoId).trim()) ||
              (dockState && dockState.id && String(dockState.id).trim()) ||
              "";
            if (clearId && !replace) {
              const el = findDock(clearId);
              if (el) el.remove();
            } else {
              allDocks().forEach((el) => el.remove());
            }
            relayoutTodoDocks();
            return;
          }

          if (sync === "set" && replace) {
            // Drop sibling docks so we never stack duplicates.
            for (const el of allDocks()) {
              const key = el.getAttribute("data-wg-todo-key") || "_default";
              if (key !== dockKey) el.remove();
            }
          }

          const POS = ["left", "right"];
          let dock = findDock(dockKey);
          if (!dock) {
            dock = document.createElement("div");
            dock.className = "wg-todo-dock";
            dock.setAttribute("data-wg-todo-key", dockKey);
            if (dockKey === "_default") dock.id = "wg-todo-dock";
            else dock.id = "wg-todo-dock--" + dockKey.replace(/[^a-zA-Z0-9_-]/g, "-");
            dock.setAttribute("data-wg-ui", "1");
            dock.setAttribute("data-wg-modal", "todos");
            dock.setAttribute("data-wg-ready", "1");
            let saved = null;
            try {
              saved = localStorage.getItem("wg-todo-pos");
            } catch {
              /* ignore */
            }
            const start =
              wantPos ||
              (saved && POS.includes(saved) ? saved : todoPos === "right" ? "right" : "left");
            dock.dataset.pos = start;
            dock.title = "Click to move checklist: left / right";
            dock.addEventListener("click", (e) => {
              e.stopPropagation();
              const i = POS.indexOf(dock.dataset.pos || "left");
              const next = POS[(i + 1) % POS.length];
              dock.dataset.pos = next;
              try {
                localStorage.setItem("wg-todo-pos", next);
              } catch {
                /* ignore */
              }
            });
            document.documentElement.appendChild(dock);
          } else if (wantPos) {
            dock.dataset.pos = wantPos;
            try {
              localStorage.setItem("wg-todo-pos", wantPos);
            } catch {
              /* ignore */
            }
          }

          const esc = (s) =>
            String(s)
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;");
          const attrId = (raw) => {
            const id = raw != null && String(raw).trim() ? String(raw).trim() : "";
            return id ? ' data-wg-todo-item="' + esc(id) + '"' : "";
          };
          const renderItems = (items, style) => {
            const rawStyle = String(style || "sequential").toLowerCase();
            const st =
              rawStyle === "checklist"
                ? "checklist"
                : rawStyle === "bullets" ||
                    rawStyle === "bullet" ||
                    rawStyle === "list" ||
                    rawStyle === "ul" ||
                    rawStyle === "points" ||
                    rawStyle === "plain"
                  ? "bullets"
                  : "sequential";
            return (
              '<ul class="wg-todos-list" data-wg-todo-style="' +
              st +
              '">' +
              (items || [])
                .map((t) => {
                  const cls =
                    st === "bullets"
                      ? t.done
                        ? "wg-todo-done"
                        : "wg-todo-pending"
                      : t.current
                        ? "wg-todo-current"
                        : t.done
                          ? "wg-todo-done"
                          : "wg-todo-pending";
                  let mark;
                  if (st === "checklist") {
                    mark = t.done ? "\u2611" : "\u2610";
                  } else if (st === "bullets") {
                    mark = "\u2022";
                  } else {
                    mark = t.done ? "\u2713" : t.current ? "\u2192" : "\u25CB";
                  }
                  const rowId = t.id || t.name || "";
                  return (
                    '<li class="' +
                    cls +
                    '"' +
                    attrId(rowId) +
                    '><span class="wg-todo-mark">' +
                    mark +
                    "</span><span>" +
                    esc(t.text || "") +
                    "</span></li>"
                  );
                })
                .join("") +
              "</ul>"
            );
          };

          if (dockKey !== "_default") dock.setAttribute("data-wg-todo-id", dockKey);
          else dock.removeAttribute("data-wg-todo-id");

          let html = "";
          if (dockState && Array.isArray(dockState.groups) && dockState.groups.length) {
            const dockTitle = dockState.title && String(dockState.title).trim();
            if (dockTitle) {
              html += '<div class="wg-todo-dock-title">' + esc(dockTitle) + "</div>";
            }
            for (const g of dockState.groups) {
              const gTitle = g.title && String(g.title).trim();
              const gid = g.id || g.name || "";
              html +=
                '<div class="wg-todo-group"' +
                (gid ? ' data-wg-todo-group="' + esc(gid) + '"' : "") +
                ">";
              if (gTitle) {
                html += '<div class="wg-todo-group-title">' + esc(gTitle) + "</div>";
              }
              html += renderItems(g.items, g.style || dockState.style);
              html += "</div>";
            }
          } else {
            html = renderItems(list, "sequential");
          }
          dock.innerHTML = html;
          relayoutTodoDocks();
          if (window.__wgStampModal) {
            window.__wgStampModal(dock, "todos", { ready: true });
          }
        };
        // Device toast + chip (0.13.2+) - announce on set/clear; quiet chip on keep.
        // Payload: { sync, device?, remain?, announce? }
        window.__wgSyncDevice = (payload) => {
          const sync =
            payload && (payload.sync === "clear" || payload.sync === "keep" || payload.sync === "set")
              ? payload.sync
              : "keep";
          const device = payload && payload.device ? payload.device : null;
          const cursor = document.getElementById("wg-cursor");
          const MOUSE_SVG =
            "<svg viewBox='0 0 32 32' width='24' height='24'>" +
            "<path fill='#0C0C1A' stroke='#fff' stroke-width='1.4' stroke-linejoin='round' " +
            "d='M6 3.5l1.4 22.5 5.8-5.4 4.2 9.4 3.6-1.6-4.2-9.2H26z'/></svg>";
          const FINGER_SVG =
            "<svg viewBox='0 0 32 32' width='28' height='28'>" +
            "<ellipse cx='16' cy='22' rx='7' ry='8' fill='#0C0C1A' stroke='#fff' stroke-width='1.4'/>" +
            "<rect x='12' y='6' width='8' height='16' rx='4' fill='#0C0C1A' stroke='#fff' stroke-width='1.4'/>" +
            "</svg>";
          const ICONS = {
            mobile:
              '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/>' +
              '<circle cx="12" cy="18.2" r="1.1" fill="#fff" stroke="none"/></svg>',
            tablet:
              '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="3.5" y="4" width="17" height="16" rx="2"/>' +
              '<circle cx="12" cy="17.2" r="1" fill="#fff" stroke="none"/></svg>',
            desktop:
              '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="2.5" y="3.5" width="19" height="12.5" rx="1.5"/>' +
              '<path d="M8 20h8M12 16v4"/></svg>',
          };
          const setCursor = (touch) => {
            if (!cursor) return;
            if (touch) {
              cursor.setAttribute("data-touch", "1");
              cursor.innerHTML = FINGER_SVG;
            } else {
              cursor.removeAttribute("data-touch");
              cursor.innerHTML = MOUSE_SVG;
            }
          };
          const ensureChip = (preset, touch, remain, orientation) => {
            let badge = document.getElementById("wg-device-badge");
            if (preset === "desktop" && !touch) {
              if (badge) {
                badge.classList.remove("wg-in");
                setTimeout(() => {
                  const b = document.getElementById("wg-device-badge");
                  if (b) b.remove();
                }, 320);
              }
              return;
            }
            if (!badge) {
              badge = document.createElement("div");
              badge.id = "wg-device-badge";
              badge.setAttribute("data-wg-ui", "1");
              document.documentElement.appendChild(badge);
            }
            badge.dataset.preset = preset;
            badge.dataset.touch = touch ? "1" : "0";
            const orient =
              orientation === "landscape" || orientation === "portrait"
                ? orientation
                : "";
            if (orient) badge.dataset.orientation = orient;
            const chipLabel =
              preset === "desktop" && !touch
                ? "desktop"
                : preset +
                  (orient ? " \u00b7 " + (orient === "landscape" ? "land" : "port") : "") +
                  (remain ? " \u00b7 remain" : "");
            badge.innerHTML =
              '<span class="wg-dev-icon">' +
              (ICONS[preset] || ICONS.desktop) +
              '</span><span class="wg-dev-label">' +
              chipLabel +
              "</span>";
            void badge.offsetWidth;
            badge.classList.add("wg-in");
          };
          const showToast = (preset, touch, title, sub, orientation) => {
            let toast = document.getElementById("wg-device-toast");
            if (toast && toast._wgTimer) {
              clearTimeout(toast._wgTimer);
              toast._wgTimer = null;
            }
            if (!toast) {
              toast = document.createElement("div");
              toast.id = "wg-device-toast";
              toast.setAttribute("data-wg-ui", "1");
              document.documentElement.appendChild(toast);
            }
            // Hide chip while toast is up (same corner).
            const badge = document.getElementById("wg-device-badge");
            if (badge) badge.classList.remove("wg-in");
            toast.dataset.preset = preset;
            toast.innerHTML =
              '<span class="wg-dev-icon">' +
              (ICONS[preset] || ICONS.desktop) +
              '</span><span class="wg-dev-copy"><div class="wg-dev-title">' +
              title +
              '</div><div class="wg-dev-sub">' +
              sub +
              "</div></span>";
            toast.classList.remove("wg-out");
            void toast.offsetWidth;
            toast.classList.add("wg-in");
            toast._wgTimer = setTimeout(() => {
              toast.classList.add("wg-out");
              toast.classList.remove("wg-in");
              setTimeout(() => {
                const t = document.getElementById("wg-device-toast");
                if (t) t.remove();
                if (preset !== "desktop" || touch) {
                  ensureChip(preset, touch, true, orientation);
                }
              }, 380);
            }, 2200);
          };

          if (sync === "keep" && !device) return;

          const isDesktopClear =
            sync === "clear" ||
            (device && device.preset === "desktop" && !device.touchMode);
          if (isDesktopClear) {
            setCursor(false);
            const announce = payload.announce !== false && sync !== "keep";
            if (announce) {
              const vp = device && device.viewport ? device.viewport : { width: 1280, height: 720 };
              showToast(
                "desktop",
                false,
                "Back to desktop",
                vp.width + "\u00d7" + vp.height + " \u00b7 mouse",
                "landscape",
              );
              setTimeout(() => {
                const badge = document.getElementById("wg-device-badge");
                if (badge) badge.remove();
              }, 2600);
            } else {
              const badge = document.getElementById("wg-device-badge");
              if (badge) badge.remove();
              const toast = document.getElementById("wg-device-toast");
              if (toast) toast.remove();
            }
            window.__wgDevicePreset = "desktop";
            window.__wgDeviceOrientation = "landscape";
            window.__wgDeviceTouch = false;
            document.documentElement.dataset.wgTouch = "0";
            if (window.__wgEnsureZoomBadge) window.__wgEnsureZoomBadge();
            return;
          }

          if (!device) return;
          const preset = device.preset || "desktop";
          const touch = !!device.touchMode;
          const remain = payload.remain !== false && sync !== "clear";
          const vp = device.viewport || {};
          const orient =
            device.orientation === "landscape" || device.orientation === "portrait"
              ? device.orientation
              : vp.height > vp.width
                ? "portrait"
                : "landscape";
          const prev = window.__wgDevicePreset || "";
          const prevOrient = window.__wgDeviceOrientation || "";
          const presetChanged = prev !== preset || (touch && prev === "desktop");
          const orientChanged = prevOrient !== "" && prevOrient !== orient;
          const changed = presetChanged || orientChanged || prev === "";
          setCursor(touch);
          window.__wgDevicePreset = preset;
          window.__wgDeviceOrientation = orient;
          window.__wgDeviceTouch = touch;
          document.documentElement.dataset.wgTouch = touch ? "1" : "0";
          if (window.__wgEnsureZoomBadge) window.__wgEnsureZoomBadge();

          const announce =
            payload.announce === true ||
            (payload.announce !== false && (sync === "set" || sync === "clear") && changed);

          const size =
            (vp.width || "?") +
            "\u00d7" +
            (vp.height || "?") +
            " \u00b7 " +
            orient +
            (touch ? " \u00b7 touch" : "");
          let titleText = {
            mobile: "Now in mobile mode",
            tablet: "Now in tablet mode",
            desktop: "Now in desktop mode",
          }[preset] || "Device updated";
          if (orientChanged && !presetChanged) {
            titleText =
              orient === "landscape" ? "Rotated to landscape" : "Rotated to portrait";
          }
          if (announce) {
            showToast(preset, touch, titleText, size, orient);
          } else {
            ensureChip(preset, touch, remain, orient);
          }
        };
      },
      { title, favicon: WAYGRAPH_FAVICON, bannerPos, todoPos, envAutoplay },
    )
    .catch(() => {});
  // Navigations wipe #wg-device-shell - rebuild when video stage + device are live.
  // If we already shuttered to desktop-flat, re-apply FLAT (never re-add bezel).
  if (
    page.__wgVideoViewport &&
    page.__wgDeviceShell &&
    page.__wgDeviceShell.width &&
    page.__wgDeviceShell.height
  ) {
    await applyVideoDeviceStage(page, page.__wgDeviceShell, page.__wgVideoViewport, {
      clear: false,
      shutterOut: !!page.__wgDesktopFlat,
      desktopFlat: !!page.__wgDesktopFlat,
    });
  }
}

async function renderBeforeStep(page, info) {
  await installOverlay(page, info.title);
  // A ring left highlighting the PREVIOUS step's element (and its live
  // resize/scroll tracker) shouldn't linger once a new step's own panel is
  // up - only relevant when a Block's act() doesn't navigate away, since a
  // real navigation already wipes document.documentElement's children.
  await page
    .evaluate(() => {
      if (window.__wgRingTrack) {
        window.removeEventListener("resize", window.__wgRingTrack);
        window.removeEventListener("scroll", window.__wgRingTrack, true);
        window.__wgRingTrack = null;
      }
      if (window.__wgHideRing) window.__wgHideRing();
      if (window.__wgHideCursor) window.__wgHideCursor();
    })
    .catch(() => {});
  // miniStepLabel / todosHtmlFromInfo are Node-only — browser evaluate has no closure.
  const payload = { ...info, stepLabel: miniStepLabel(info) };
  await page
    .evaluate((info) => {
      // Reused in place, not removed + recreated, every step - the old
      // remove()-then-fade-back-in cycle was a real flash on every single
      // transition (Dan: "the appear and disappear... hurts eyes and
      // dizzy"). Updating one persistent element's content has nothing to
      // flash - it only ever fades in ONCE, the first time this page
      // genuinely has no panel yet (a real navigation wiped the whole
      // document, or this is the very first step).
      let panel = document.getElementById("wg-panel");
      const isNewPanel = !panel;
      if (!panel) {
        panel = document.createElement("div");
        panel.id = "wg-panel";
      }
      const pct = Math.round((info.index / info.total) * 100);
      const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      // A real tab bar, not a single text line - every episode this chain
      // touches, the current one reading as active (Dan: "if episode 1 is
      // active, the episode 2 tab is inactive"). Absent entirely for an ad
      // hoc block chain with no named Flows.
      const episodesHtml = info.allEpisodes && info.allEpisodes.length > 0
        ? "<div id=\\"wg-episodes\\">" +
          info.allEpisodes
            .map((e) => {
              const cls = e.episodeNumber < info.episodeNumber ? "wg-ep-done"
                : e.episodeNumber === info.episodeNumber ? "wg-ep-current"
                : "wg-ep-upcoming";
              // The gentle one-time glow only plays on the tab actually
              // being entered right now, not on every render of it.
              const enteredCls = info.justEnteredEpisode && e.episodeNumber === info.episodeNumber
                ? " wg-ep-entered"
                : "";
              return "<span class=\\"wg-ep-tab " + cls + enteredCls + "\\">Episode " + e.episodeNumber + ": " +
                esc(e.episodeTitle || "") + "</span>";
            })
            .join("") +
          "</div>"
        : "";
      // Scoped to THIS episode's own blocks (info.allNames is already the
      // episode-local subset the caller computed) - moduleIndex is this
      // step's position WITHIN that subset, not the whole chain's index -
      // "in episode 2 it shows 2nd to the last... it should start from the
      // first block" (Dan).
      const modulesClass = info.stepperMode === "full" ? "wg-modules-full" : "wg-modules-carousel";
      const modulesHtml = info.allNames
        .map((name, idx) => {
          const cls = idx < info.moduleIndex ? "wg-mod-done" : idx === info.moduleIndex ? "wg-mod-current" : "wg-mod-upcoming";
          const desc = info.allDescriptions && info.allDescriptions[idx];
          const titleAttr = desc ? " title=\\"" + esc(desc) + "\\"" : "";
          return "<span class=\\"wg-mod " + cls + "\\"" + titleAttr + ">" + name + "</span>";
        })
        .join("");
      const narrationHtml = info.description
        ? "<div class=\\"wg-narration\\">" + esc(info.description) + "</div>"
        : "";
      const paceHtml =
        info.paceBadge || info.paceLabel
          ? "<div class=\\"wg-pace\\" data-pace-kind=\\"" +
            esc(info.paceKind || "normal") +
            "\\"><span class=\\"wg-pace-badge\\">" +
            esc(info.paceBadge || "1x") +
            "</span><span>" +
            esc(info.paceLabel || "") +
            "</span></div>"
          : "";
      // Todos render into floating #wg-todo-dock via __wgSyncTodos - never
      // inside .wg-body (would vanish under --mini / Hide collapse).
      let html =
        "<div id=\\"wg-progress\\"><div id=\\"wg-progress-bar\\" style=\\"width:" + pct + "%\\"></div></div>" +
        episodesHtml +
        paceHtml +
        "<div id=\\"wg-modules\\" class=\\"" + modulesClass + "\\">" + modulesHtml + "</div>" +
        "<h3>Step " + (info.index + 1) + " / " + info.total + " - " + info.blockName + "</h3>" +
        narrationHtml;
      if (info.keys.length === 0) {
        html += "<div class=\\"wg-key\\">(no MemKeys required)</div>";
      }
      for (const k of info.keys) {
        html +=
          "<div class=\\"wg-key\\"><label>" + k.name + "</label>" +
          "<textarea data-key=\\"" + k.name + "\\" rows=\\"2\\">" +
          k.value.replace(/</g, "&lt;") + "</textarea>" +
          "<div class=\\"wg-key-pretty\\" data-pretty-for=\\"" + esc(k.name) + "\\"></div>" +
          "</div>";
      }
      let autoNow = false;
      try {
        autoNow = localStorage.getItem("wg-autoplay") === "1";
      } catch {
        /* private mode / blocked storage - defaults to manual */
      }
      html +=
        "<div class=\\"wg-autoplay-row\\"><label><input type=\\"checkbox\\" id=\\"wg-autoplay-cb\\"" +
        (autoNow ? " checked" : "") +
        "> Auto-advance</label></div>" +
        "<div id=\\"wg-gate-manual\\"" + (autoNow ? " style=\\"display:none\\"" : "") +
        "><button id=\\"wg-run\\">Run this step \\u25B6</button></div>" +
        "<div id=\\"wg-gate-auto\\" class=\\"wg-auto\\"" + (autoNow ? "" : " style=\\"display:none\\"") +
        ">Auto-advancing...</div>";
      panel.innerHTML = html;
      if (isNewPanel) {
        document.documentElement.appendChild(panel);
        requestAnimationFrame(() => panel.classList.add("wg-in"));
      } else {
        panel.classList.add("wg-in");
      }
      if (window.__wgWirePanelChrome) {
        window.__wgWirePanelChrome(panel, "wg-panel-hidden", "waygraph demo", {
          stepLabel: info.stepLabel || "",
          forceCollapsed: info.forceCollapsed === true ? true : undefined,
        });
      }
      if (window.__wgSyncTodos) {
        const sync = info.todoSync || (info.todos && info.todos.length ? "set" : "keep");
        // Prefer dock-only payload. Passing list:[] with a dock used to clear
        // marks a frame later (empty-list clear path).
        if (sync === "keep" && !info.todoDock) {
          /* leave floating dock alone */
        } else {
          const payload = {
            sync: sync,
            dock: info.todoDock || null,
            pos: info.todoPos || null,
            todoId: info.todoId || (info.todoDock && info.todoDock.id) || null,
          };
          if (!info.todoDock && info.todos && info.todos.length) {
            payload.list = info.todos;
          }
          window.__wgSyncTodos(payload);
        }
      }
      if (window.__wgStampModal) {
        window.__wgStampModal(panel, "panel", {
          phase: "before",
          step: info.index + 1,
          total: info.total,
          block: info.blockName || "",
          ready: true,
        });
      }
      // Live, human-readable preview of what a MemKey's raw JSON will
      // actually write - object fields become "Field: value" lines
      // (camelCase split the same way state tags already are); a
      // non-object payload (a plain string/number/array) is shown as-is.
      // Hidden entirely in JSON mode - shares the SAME global toggle the
      // result display's own Pretty/JSON buttons already set, not a
      // second, separate preference.
      const prettyMemValue = (raw) => {
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return "<em>(invalid JSON)</em>";
        }
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          return esc(JSON.stringify(parsed));
        }
        return Object.entries(parsed)
          .map(([field, value]) => {
            const label = field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
            return "<div class=\\"wg-key-pretty-row\\"><span class=\\"wg-key-pretty-label\\">" +
              esc(label) + ":</span> " + esc(String(value)) + "</div>";
          })
          .join("");
      };
      const applyKeyPretty = () => {
        const prettyOn = window.__wgPretty !== false;
        panel.querySelectorAll("textarea[data-key]").forEach((ta) => {
          const key = ta.getAttribute("data-key");
          const previewEl = panel.querySelector(".wg-key-pretty[data-pretty-for=\\"" + key + "\\"]");
          if (!previewEl) return;
          previewEl.style.display = prettyOn ? "" : "none";
          if (prettyOn) previewEl.innerHTML = prettyMemValue(ta.value);
        });
      };
      applyKeyPretty();
      panel.querySelectorAll("textarea[data-key]").forEach((ta) => {
        ta.addEventListener("input", applyKeyPretty);
      });
      const runBtn = document.getElementById("wg-run");
      if (runBtn) {
        runBtn.addEventListener("click", () => {
          const edits = {};
          panel.querySelectorAll("textarea[data-key]").forEach((el) => {
            edits[el.getAttribute("data-key")] = el.value;
          });
          window.__wgNext(edits);
        });
      }
      // Live toggle - flips localStorage immediately so an in-flight gate()
      // poll (on the Node side) picks it up within its next poll slice,
      // without needing this whole panel to re-render. A manual click
      // still always wins over an active autoplay wait, whichever the
      // checkbox says - this is the "hybrid" control: autoplay is a
      // default, not a lockout.
      const cb = document.getElementById("wg-autoplay-cb");
      if (cb) {
        cb.addEventListener("change", () => {
          try {
            localStorage.setItem("wg-autoplay", cb.checked ? "1" : "0");
          } catch {
            /* private mode / blocked storage - toggle still works this page */
          }
          const manual = document.getElementById("wg-gate-manual");
          const auto = document.getElementById("wg-gate-auto");
          if (manual) manual.style.display = cb.checked ? "none" : "";
          if (auto) auto.style.display = cb.checked ? "" : "none";
        });
      }
    }, payload)
    .catch(() => {});
  if (process.env.WAYGRAPH_PROVE_SHOT || process.env.WAYGRAPH_PROVE_EXIT === "1") {
    // Default: prove once on first painted panel. PROVE_EVERY=1 re-checks
    // every step (noisy; useful when hunting a mid-chain blank).
    const proveEvery = process.env.WAYGRAPH_PROVE_EVERY === "1";
    const already = globalThis.__wgProveDone;
    if (!already || proveEvery || process.env.WAYGRAPH_PROVE_EXIT === "1") {
      await page.waitForTimeout(500).catch(() => {});
      if (process.env.WAYGRAPH_PROVE_SHOT) {
        await page.screenshot({ path: process.env.WAYGRAPH_PROVE_SHOT }).catch(() => {});
      }
      const ok = await page
        .evaluate(() => {
          const beacons =
            typeof window.__wgOverlayBeacon === "function" ? window.__wgOverlayBeacon() : [];
          const panel = beacons.find((b) => b.modal === "panel" && b.ready && b.visible);
          const textOk = panel && panel.textLen >= 12;
          const opacityOk = panel && Number(panel.opacity) > 0.5;
          return {
            ok: !!(panel && textOk && opacityOk),
            beacons,
            hasRun: !!document.getElementById("wg-run"),
            readyAttr: document.getElementById("wg-panel")?.getAttribute("data-wg-ready") || null,
          };
        })
        .catch((e) => ({ ok: false, reason: String(e && e.message ? e.message : e) }));
      console.error("WAYGRAPH_PROVE " + JSON.stringify(ok));
      globalThis.__wgProveDone = true;
      if (process.env.WAYGRAPH_PROVE_EXIT === "1") {
        process.exit(ok && ok.ok ? 0 : 2);
      }
    }
  }
}

/**
 * Scroll a locator into view for demo theater.
 * Prefer CSS smooth scroll + scrollend wait. Do NOT call Playwright's
 * scrollIntoViewIfNeeded first - that jumps instantly and makes the
 * following smooth scroll a no-op (looks like a teleport), especially
 * noticeable under --fast when dwell is shorter.
 * Pass opts.instant=true only for skipTheater / blitz.
 */
async function ensureLocatorInView(locator, opts) {
  const instant = !!(opts && opts.instant);
  try {
    if (instant) {
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      return;
    }
    // Touch mode: if the target is off-screen, show a swipe trail in the
    // finger direction that would scroll it into view (not device morph).
    const scrollPlan = await locator
      .evaluate((el) => {
        if (!el || typeof el.getBoundingClientRect !== "function") return null;
        const touch =
          window.__wgDeviceTouch === true ||
          document.documentElement.dataset.wgTouch === "1" ||
          window.__wgDevicePreset === "mobile" ||
          window.__wgDevicePreset === "tablet";
        if (!touch) return null;
        const r = el.getBoundingClientRect();
        const vw = window.innerWidth || 390;
        const vh = window.innerHeight || 844;
        const margin = 48;
        const below = r.top > vh - margin;
        const above = r.bottom < margin;
        const right = r.left > vw - margin;
        const left = r.right < margin;
        if (!below && !above && !left && !right) return null;
        // Finger direction to reveal the target (swipe up => content moves up).
        let dir = "up";
        if (below) dir = "up";
        else if (above) dir = "down";
        else if (right) dir = "left";
        else if (left) dir = "right";
        return { dir, hint: "scroll" };
      })
      .catch(() => null);
    if (scrollPlan && scrollPlan.dir) {
      demoLog("  swipe trail dir=" + scrollPlan.dir + " hint=scroll");
      await playSwipeTrail(locator.page(), {
        dir: scrollPlan.dir,
        label: "swipe \\u00b7 scroll",
        hint: "scroll",
        ms: Number(process.env.WAYGRAPH_SWIPE_MS || 650),
      });
    }
    await locator
      .evaluate(async (el) => {
        if (!el || typeof el.scrollIntoView !== "function") return;
        const waitScroll = (node, ms) =>
          new Promise((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              try {
                node.removeEventListener("scrollend", finish);
              } catch {
                /* ignore */
              }
              clearTimeout(t);
              resolve();
            };
            const t = setTimeout(finish, ms);
            try {
              node.addEventListener("scrollend", finish, { once: true });
            } catch {
              /* scrollend unsupported - timeout only */
            }
          });
        try {
          el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        } catch {
          try {
            el.scrollIntoView({ block: "center", inline: "center" });
          } catch {
            try {
              el.scrollIntoView(true);
            } catch {
              /* ignore */
            }
          }
        }
        await waitScroll(document.scrollingElement || document.documentElement, 650);
        let p = el.parentElement;
        while (p && p !== document.documentElement && p !== document.body) {
          const st = getComputedStyle(p);
          const ox = st.overflowX;
          const oy = st.overflowY;
          if (/(auto|scroll|overlay)/.test(ox) || /(auto|scroll|overlay)/.test(oy)) {
            const er = el.getBoundingClientRect();
            const pr = p.getBoundingClientRect();
            if (er.left < pr.left || er.right > pr.right || er.top < pr.top || er.bottom > pr.bottom) {
              const left = p.scrollLeft + (er.left + er.width / 2 - (pr.left + pr.width / 2));
              const top = p.scrollTop + (er.top + er.height / 2 - (pr.top + pr.height / 2));
              try {
                p.scrollTo({ left, top, behavior: "smooth" });
              } catch {
                p.scrollLeft = left;
                p.scrollTop = top;
              }
              await waitScroll(p, 650);
            }
          }
          p = p.parentElement;
        }
      })
      .catch(() => {});
  } catch {
    /* best-effort */
  }
}

async function ensureSelectorInView(page, selector, opts) {
  await ensureLocatorInView(page.locator(selector).first(), opts);
}

async function applyHighlightZoom(page, selector, zoom, zoomOut) {
  const z = Number(zoom);
  if (!Number.isFinite(z) || z <= 1.001) {
    await page.evaluate(() => {
      window.__wgZoomOutOnHide = true;
      if (window.__wgClearZoom) window.__wgClearZoom();
    }).catch(() => {});
    return;
  }
  demoFixture("zoom", "ctx/ring zoom(" + z + ") zoomOut=" + (zoomOut !== false), selector);
  await page
    .evaluate(
      ({ sel, scale, zoomOut }) => {
        // false = keep camera after ring hide (ctx.zoomOut(false) / ring.zoomOut).
        window.__wgZoomOutOnHide = zoomOut !== false;
        if (window.__wgApplyZoom) window.__wgApplyZoom(sel, scale);
      },
      { sel: selector, scale: z, zoomOut: zoomOut !== false },
    )
    .catch(() => {});
}

async function applyHighlightFocus(page, box, focus) {
  if (!focus || !box) {
    await page
      .evaluate(() => {
        if (window.__wgClearFocus) window.__wgClearFocus();
      })
      .catch(() => {});
    return;
  }
  demoFixture("focus", "ctx/ring focus(true)", {
    x: Math.round(box.x),
    y: Math.round(box.y),
    w: Math.round(box.width),
    h: Math.round(box.height),
  });
  await page
    .evaluate((b) => {
      if (window.__wgApplyFocus) window.__wgApplyFocus(b);
    }, box)
    .catch(() => {});
}

function todosHtmlFromInfo(info, escFn) {
  const list = info.todos || [];
  if (!list.length) return "";
  return (
    "<ul id=\\"wg-todos\\">" +
    list
      .map((t) => {
        const cls = t.current ? "wg-todo-current" : t.done ? "wg-todo-done" : "wg-todo-pending";
        const mark = t.done ? "\\u2713" : t.current ? "\\u2192" : "\\u25CB";
        return (
          "<li class=\\"" +
          cls +
          "\\"><span class=\\"wg-todo-mark\\">" +
          mark +
          "</span><span>" +
          escFn(t.text || "") +
          "</span></li>"
        );
      })
      .join("") +
    "</ul>"
  );
}

function miniStepLabel(info) {
  const ep =
    info.episodeNumber !== undefined && info.episodeNumber !== null
      ? "Ep " + info.episodeNumber + " \\u00b7 "
      : "";
  return (
    ep +
    (info.index + 1) +
    " / " +
    info.total +
    (info.blockName ? " \\u00b7 " + info.blockName : "") +
    (info.paceBadge ? " \\u00b7 " + info.paceBadge : "")
  );
}

/**
 * stubOnError rings + amber "expected outcome" / red error panel, then wait
 * for Stop/Retry. Used when a step throws OR when withExpectedFailure's last
 * block succeeds on the intentional fail branch (e.g. LoginPage + error banner).
 */
async function presentFailPanel(page, opts) {
  const {
    block,
    fixtures,
    error,
    index,
    total,
    blockName,
    message,
    allNames,
    allDescriptions,
    moduleIndex,
    allEpisodes,
    title,
    episodeNumber,
    episodeTitle,
    expectedFailureReason,
    stepperMode,
    gatesFast,
    demoPace,
    gate,
    mem,
  } = opts;
  if (hasAuthoredStubOnError(block, fixtures)) {
    await page
      .evaluate(() => {
        if (window.__wgRingTrack) {
          window.removeEventListener("resize", window.__wgRingTrack);
          window.removeEventListener("scroll", window.__wgRingTrack, true);
          window.__wgRingTrack = null;
        }
      })
      .catch(() => {});
    const errPhase = await runStubPhase(block, "stubOnError", {
      fixtures,
      error,
      out: opts.out,
      mem,
    });
    const errHighlights = errPhase.highlights.map((h) => {
      const styled = applyHighlightStyleDefaults(h, opts.highlightStyle);
      return {
        selector: styled.selector,
        label: formatHighlightCaption(styled),
        duration: styled.duration,
        fastMode: styled.fastMode,
        tone: styled.tone,
        size: styled.size,
        weight: styled.weight,
        zoom: styled.zoom,
        zoomOut: styled.zoomOut,
        focus: !!styled.focus,
        tone: styled.tone,
        color: styled.color,
        detail: styled.detail,
      };
    });
    await cycleHighlightRings(page, errHighlights, !!gatesFast, {
      defaultHoldMs: 2000,
      pace: demoPace,
      todos: errPhase.todos,
    });
  }
  await renderStepError(page, {
    index,
    total,
    blockName,
    message,
    allNames,
    allDescriptions,
    moduleIndex,
    allEpisodes,
    title,
    episodeNumber,
    episodeTitle,
    expectedFailureReason,
    stepperMode,
  });
  return gate();
}

async function cycleHighlightRings(page, highlights, gatesFast, opts) {
  const list = highlights || [];
  // defaultHoldMs: when set (fail path), use instead of legacy 900/200 so BUG
  // rings stay visible ~2s before the error panel (PIA stubOnError RFC).
  const defaultHoldMs = opts && opts.defaultHoldMs != null ? opts.defaultHoldMs : null;
  const pace = opts && opts.pace !== undefined ? opts.pace : undefined;
  let dock = opts && opts.todoDock;
  const advanceTodos = !(opts && opts.advanceTodos === false);
  // Push stubAfter/before dock before the first ring so Method after-panels
  // show the updated checklist immediately (not only after the ring cycle).
  if (dock) {
    await page
      .evaluate((d) => {
        if (window.__wgSyncTodos) window.__wgSyncTodos({ sync: "set", dock: d });
      }, dock)
      .catch(() => {});
  } else if (opts && opts.todoSync === "clear") {
    await page
      .evaluate(() => {
        if (window.__wgSyncTodos) window.__wgSyncTodos({ sync: "clear" });
      })
      .catch(() => {});
  }
  let lastRingEndedAt = null;
  for (let i = 0; i < list.length; i++) {
    const h = list[i];
    const ringStarted = Date.now();
    try {
      await ensureSelectorInView(page, h.selector);
      await applyHighlightZoom(page, h.selector, h.zoom, h.zoomOut);
      // Prefer live in-page rect (honors device-shell scale) over Playwright box.
      const box = await page
        .evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }, h.selector)
        .catch(() => null);
      if (box && box.width > 0 && box.height > 0) {
        await showRing(page, box, h.label, h.tone || "planned", {
          size: h.size,
          weight: h.weight,
          selector: h.selector,
          focus: !!h.focus,
        });
        // focus is applied by FollowRing / showRing - no second apply needed
        // Do NOT advanceTodoDock by ring index after stubAfter already set
        // progress - that reset current back to 0 and the next block looked
        // blank. Mid-act Method advance still uses syncTodoDockAdvance.
        if (dock && advanceTodos) {
          dock = advanceTodoDock(dock, i);
          if (opts && opts.todoDockRef) opts.todoDockRef.current = dock;
          await page
            .evaluate((d) => {
              if (window.__wgSyncTodos) window.__wgSyncTodos({ sync: "set", dock: d });
            }, dock)
            .catch(() => {});
        } else if (!dock && ((opts && opts.todos && opts.todos.length) || (h.todos && h.todos.length))) {
          const rows =
            opts && opts.todos && opts.todos.length
              ? opts.todos
              : normalizeTodos(h.todos, h.todoIndex);
          await page
            .evaluate((todos) => {
              if (window.__wgSyncTodos) {
                window.__wgSyncTodos({ sync: "set", list: todos });
                return;
              }
              // Fallback for pages that never got installOverlay sync helper.
              const ul = document.getElementById("wg-todos");
              if (!ul) return;
              ul.innerHTML = todos
                .map((t) => {
                  const cls = t.current
                    ? "wg-todo-current"
                    : t.done
                      ? "wg-todo-done"
                      : "wg-todo-pending";
                  const mark = t.done ? "\\u2713" : t.current ? "\\u2192" : "\\u25CB";
                  const esc = (s) =>
                    String(s)
                      .replace(/&/g, "&amp;")
                      .replace(/</g, "&lt;")
                      .replace(/>/g, "&gt;");
                  return (
                    "<li class=\\"" +
                    cls +
                    "\\"><span class=\\"wg-todo-mark\\">" +
                    mark +
                    "</span><span>" +
                    esc(t.text || "") +
                    "</span></li>"
                  );
                })
                .join("");
            }, rows)
            .catch(() => {});
        }
        const authored = resolveFixtureDwellMs(h, { gatesFast, pace });
        const legacyMs = i === list.length - 1 ? 200 : 900;
        const holdMs =
          authored != null ? authored : defaultHoldMs != null ? defaultHoldMs : legacyMs;
        const gap = lastRingEndedAt != null ? ringStarted - lastRingEndedAt : null;
        const holdExtra =
          "hold=" +
          holdMs +
          "ms" +
          (authored != null ? " authored" : " default") +
          " box=" +
          Math.round(box.x) +
          "," +
          Math.round(box.y) +
          " " +
          Math.round(box.width) +
          "x" +
          Math.round(box.height) +
          (gap != null ? " gap=" + gap + "ms" : "");
        demoHighlight(h, holdExtra);
        demoLog(
          "  highlight " +
            (i + 1) +
            "/" +
            list.length +
            (gap != null && gap < 120 ? ansiPaint(ANSI.yellow, " WARN gap<120ms") : "") +
            (holdMs < 250 && list.length > 1 ? ansiPaint(ANSI.yellow, " WARN short hold") : ""),
        );
        await new Promise((res) => setTimeout(res, holdMs));
        lastRingEndedAt = Date.now();
      } else {
        demoHighlight(h, "SKIP no boundingBox");
      }
    } catch (err) {
      demoHighlight(
        h || { selector: h && h.selector, label: "(error)" },
        "SKIP " + String(err && err.message ? err.message : err).slice(0, 80),
      );
    }
  }
  if (list.length > 0) {
    const last = list[list.length - 1];
    await page
      .evaluate((h) => {
        if (!window.__wgFollowRing && !window.__wgPositionRing) return;
        if (window.__wgFollowRing) {
          window.__wgFollowRing(
            h.selector,
            h.label,
            h.tone || "planned",
            { size: h.size || "md", weight: h.weight || "normal" },
            !!h.focus,
          );
          return;
        }
        const reposition = () => {
          const el = document.querySelector(h.selector);
          if (!el) {
            if (window.__wgHideRing) window.__wgHideRing();
            return;
          }
          const box = el.getBoundingClientRect();
          window.__wgPositionRing(box, h.label, h.tone || "planned", {
            size: h.size || "md",
            weight: h.weight || "normal",
          });
          if (h.focus && window.__wgApplyFocus) {
            window.__wgApplyFocus({
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
            });
          }
        };
        reposition();
        window.__wgRingTrack = reposition;
        window.addEventListener("resize", reposition);
        window.addEventListener("scroll", reposition, true);
      }, last)
      .catch(() => {});
  } else {
    await hideRing(page);
  }
}

async function renderAfterStep(page, info) {
  await installOverlay(page, info.title);
  // Clear any tracker from a previous highlight before cycling through this
  // step's own.
  await page
    .evaluate(() => {
      if (window.__wgRingTrack) {
        window.removeEventListener("resize", window.__wgRingTrack);
        window.removeEventListener("scroll", window.__wgRingTrack, true);
        window.__wgRingTrack = null;
      }
    })
    .catch(() => {});
  const highlights = info.highlights || [];
  const gatesFast = !!info.gatesFast;
  // Cycle through EVERY declared/recovered highlight in order, each shown
  // long enough to actually register - "it highlights something [...] then
  // it highlights something [else] and next," not just the first one.
  // duration / fastMode on stubAfter (or flow fixtures) override the legacy
  // 900ms / 200ms holds when set.
  await cycleHighlightRings(page, highlights, gatesFast, {
    pace: info.pace,
    stepLabel: miniStepLabel(info),
    todoDock: info.todoDock,
    todos: info.todos,
    todoSync: info.todoSync,
    todoDockRef: info.todoDockRef,
    // stubAfter already authored progress - do not re-index by ring 0..n
    advanceTodos: false,
  });
  // After-ring advances may have moved the dock - surface latest for caller.
  if (info.todoDockRef && info.todoDockRef.current) {
    info.todoDock = info.todoDockRef.current;
  }
  const afterPayload = { ...info, stepLabel: miniStepLabel(info) };
  await page
    .evaluate((info) => {
      // Reused in place - see renderBeforeStep's own comment on this.
      let panel = document.getElementById("wg-panel");
      const isNewPanel = !panel;
      if (!panel) {
        panel = document.createElement("div");
        panel.id = "wg-panel";
      }
      const pct = Math.round(((info.index + 1) / info.total) * 100);
      const heading = info.isLast
        ? "End of chain - " + info.total + " / " + info.total + " blocks covered - " + info.blockName + " done"
        : "Step " + (info.index + 1) + " / " + info.total + " - " + info.blockName + " done";
      const buttonLabel = info.isLast ? "Finish" : "Next \\u25B6";
      const escA = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      const modulesClass = info.stepperMode === "full" ? "wg-modules-full" : "wg-modules-carousel";
      const modulesHtml = info.allNames
        .map((name, idx) => {
          const cls = idx <= info.moduleIndex ? "wg-mod-done" : "wg-mod-upcoming";
          const desc = info.allDescriptions && info.allDescriptions[idx];
          const titleAttr = desc ? " title=\\"" + escA(desc) + "\\"" : "";
          return "<span class=\\"wg-mod " + cls + "\\"" + titleAttr + ">" + name + "</span>";
        })
        .join("");
      // QA-friendly by default ("LoginSuccess" -> "Login Success") - raw
      // JSON is one click away for whoever actually wants __state.
      const stateTag = info.result && info.result.__state ? info.result.__state : "";
      const prettyText = stateTag
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") || info.resultTag;
      const pretty = window.__wgPretty !== false;
      const resultHtml =
        "<div class=\\"wg-toggle\\">" +
        "<button class=\\"wg-toggle-btn" + (pretty ? " wg-active" : "") + "\\" data-mode=\\"pretty\\">Pretty</button>" +
        "<button class=\\"wg-toggle-btn" + (pretty ? "" : " wg-active") + "\\" data-mode=\\"json\\">JSON</button>" +
        "</div>" +
        "<div class=\\"wg-result wg-result-pretty\\" style=\\"display:" + (pretty ? "block" : "none") + "\\">" +
        prettyText + "</div>" +
        "<div class=\\"wg-result wg-result-json\\" style=\\"display:" + (pretty ? "none" : "block") + "\\">" +
        info.resultTag + "</div>";
      let autoNow = false;
      try {
        autoNow = localStorage.getItem("wg-autoplay") === "1";
      } catch {
        /* private mode / blocked storage - defaults to manual */
      }
      const gateHtml =
        "<div class=\\"wg-autoplay-row\\"><label><input type=\\"checkbox\\" id=\\"wg-autoplay-cb\\"" +
        (autoNow ? " checked" : "") +
        "> Auto-advance</label></div>" +
        "<div id=\\"wg-gate-manual\\"" + (autoNow ? " style=\\"display:none\\"" : "") +
        "><button id=\\"wg-run\\">" + buttonLabel + "</button></div>" +
        "<div id=\\"wg-gate-auto\\" class=\\"wg-auto\\"" + (autoNow ? "" : " style=\\"display:none\\"") +
        ">Auto-advancing...</div>";
      const episodesHtml = info.allEpisodes && info.allEpisodes.length > 0
        ? "<div id=\\"wg-episodes\\">" +
          info.allEpisodes
            .map((e) => {
              const cls = e.episodeNumber < info.episodeNumber ? "wg-ep-done"
                : e.episodeNumber === info.episodeNumber ? "wg-ep-current"
                : "wg-ep-upcoming";
              return "<span class=\\"wg-ep-tab " + cls + "\\">Episode " + e.episodeNumber + ": " +
                escA(e.episodeTitle || "") + "</span>";
            })
            .join("") +
          "</div>"
        : "";
      const paceHtml =
        info.paceBadge || info.paceLabel
          ? "<div class=\\"wg-pace\\" data-pace-kind=\\"" +
            escA(info.paceKind || "normal") +
            "\\"><span class=\\"wg-pace-badge\\">" +
            escA(info.paceBadge || "1x") +
            "</span><span>" +
            escA(info.paceLabel || "") +
            "</span></div>"
          : "";
      const todosHtml = ""; // todos float in #wg-todo-dock via __wgSyncTodos
      panel.innerHTML =
        "<div id=\\"wg-progress\\"><div id=\\"wg-progress-bar\\" style=\\"width:" + pct + "%\\"></div></div>" +
        episodesHtml +
        paceHtml +
        "<div id=\\"wg-modules\\" class=\\"" + modulesClass + "\\">" + modulesHtml + "</div>" +
        "<h3>" + heading + "</h3>" +
        todosHtml +
        resultHtml +
        gateHtml;
      if (isNewPanel) {
        document.documentElement.appendChild(panel);
        requestAnimationFrame(() => panel.classList.add("wg-in"));
      } else {
        panel.classList.add("wg-in");
      }
      if (window.__wgWirePanelChrome) {
        window.__wgWirePanelChrome(panel, "wg-panel-hidden", "waygraph demo", {
          stepLabel: info.stepLabel || "",
          forceCollapsed: info.forceCollapsed === true ? true : undefined,
        });
      }
      if (window.__wgSyncTodos) {
        const sync = info.todoSync || (info.todos && info.todos.length ? "set" : "keep");
        // Prefer dock-only payload. Passing list:[] with a dock used to clear
        // marks a frame later (empty-list clear path).
        if (sync === "keep" && !info.todoDock) {
          /* leave floating dock alone */
        } else {
          const payload = {
            sync: sync,
            dock: info.todoDock || null,
            pos: info.todoPos || null,
            todoId: info.todoId || (info.todoDock && info.todoDock.id) || null,
          };
          if (!info.todoDock && info.todos && info.todos.length) {
            payload.list = info.todos;
          }
          window.__wgSyncTodos(payload);
        }
      }
      if (window.__wgStampModal) {
        window.__wgStampModal(panel, "panel", {
          phase: "after",
          step: info.index + 1,
          total: info.total,
          block: info.blockName || "",
          ready: true,
        });
      }
      panel.querySelectorAll(".wg-toggle-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const wantPretty = btn.getAttribute("data-mode") === "pretty";
          window.__wgPretty = wantPretty;
          panel.querySelectorAll(".wg-toggle-btn").forEach((b) => b.classList.remove("wg-active"));
          btn.classList.add("wg-active");
          panel.querySelector(".wg-result-pretty").style.display = wantPretty ? "block" : "none";
          panel.querySelector(".wg-result-json").style.display = wantPretty ? "none" : "block";
        });
      });
      const runBtn = document.getElementById("wg-run");
      if (runBtn) runBtn.addEventListener("click", () => window.__wgNext({}));
      const cb = document.getElementById("wg-autoplay-cb");
      if (cb) {
        cb.addEventListener("change", () => {
          try {
            localStorage.setItem("wg-autoplay", cb.checked ? "1" : "0");
          } catch {
            /* private mode / blocked storage - toggle still works this page */
          }
          const manual = document.getElementById("wg-gate-manual");
          const auto = document.getElementById("wg-gate-auto");
          if (manual) manual.style.display = cb.checked ? "none" : "";
          if (auto) auto.style.display = cb.checked ? "" : "none";
        });
      }
    }, afterPayload)
    .catch(() => {});
}

/**
 * A Block threw - act()/observe() rejected, or Flow.run's own verify Trait
 * check failed. Shown instead of letting it crash the whole Node process
 * silently from a human's point of view (the browser closes right after
 * regardless - main()'s own try/finally - but not before this is visible).
 */
async function renderStepError(page, info) {
  await installOverlay(page, info.title);
  const errorPayload = { ...info, stepLabel: miniStepLabel(info) };
  await page
    .evaluate((info) => {
      // Reused in place - see renderBeforeStep's own comment on this.
      let panel = document.getElementById("wg-panel");
      const isNewPanel = !panel;
      if (!panel) {
        panel = document.createElement("div");
        panel.id = "wg-panel";
      }
      const isExpected = !!info.expectedFailureReason;
      const errClass = isExpected ? "wg-expected" : "wg-error";
      panel.classList.remove("wg-error", "wg-expected");
      panel.classList.add(errClass);
      if (!isNewPanel) panel.classList.add("wg-in");
      const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      const episodesHtml = info.allEpisodes && info.allEpisodes.length > 0
        ? "<div id=\\"wg-episodes\\">" +
          info.allEpisodes
            .map((e) => {
              const cls = e.episodeNumber < info.episodeNumber ? "wg-ep-done"
                : e.episodeNumber === info.episodeNumber ? "wg-ep-current"
                : "wg-ep-upcoming";
              return "<span class=\\"wg-ep-tab " + cls + "\\">Episode " + e.episodeNumber + ": " +
                esc(e.episodeTitle || "") + "</span>";
            })
            .join("") +
          "</div>"
        : "";
      const modulesClass = info.stepperMode === "full" ? "wg-modules-full" : "wg-modules-carousel";
      const modulesHtml = info.allNames
        .map((name, idx) => {
          const cls = idx === info.moduleIndex ? "wg-mod-current" : idx < info.moduleIndex ? "wg-mod-done" : "wg-mod-upcoming";
          const desc = info.allDescriptions && info.allDescriptions[idx];
          const titleAttr = desc ? " title=\\"" + esc(desc) + "\\"" : "";
          return "<span class=\\"wg-mod " + cls + "\\"" + titleAttr + ">" + name + "</span>";
        })
        .join("");
      const retryLabel = info.episodeNumber !== undefined ? "Retry Episode " + info.episodeNumber : "Retry";
      const headingText = isExpected
        ? "Expected outcome - Step " + (info.index + 1) + " / " + info.total + " - " + info.blockName + " failed as intended"
        : "Step " + (info.index + 1) + " / " + info.total + " - " + info.blockName + " threw";
      const reasonHtml = isExpected
        ? "<div class=\\"wg-expected-reason\\">" + esc(info.expectedFailureReason) + "</div>"
        : "";
      panel.innerHTML =
        episodesHtml +
        "<div id=\\"wg-modules\\" class=\\"" + modulesClass + "\\">" + modulesHtml + "</div>" +
        "<h3 class=\\"" + (isExpected ? "wg-expected-heading" : "wg-error-heading") + "\\">" + headingText + "</h3>" +
        reasonHtml +
        "<div class=\\"wg-error-msg\\">" + esc(info.message) + "</div>" +
        "<div class=\\"wg-error-actions\\">" +
        "<button id=\\"wg-error-retry\\" class=\\"wg-error-retry\\">" + esc(retryLabel) + "</button>" +
        "<button id=\\"wg-run\\" class=\\"wg-error-stop\\">Stop</button>" +
        "</div>";
      if (isNewPanel) {
        document.documentElement.appendChild(panel);
        requestAnimationFrame(() => panel.classList.add("wg-in"));
      } else {
        panel.classList.add("wg-in");
      }
      if (window.__wgWirePanelChrome) {
        window.__wgWirePanelChrome(panel, "wg-panel-hidden", "waygraph demo", {
          stepLabel: info.stepLabel || "",
          forceCollapsed: info.forceCollapsed === true ? true : undefined,
        });
      }
      if (window.__wgStampModal) {
        window.__wgStampModal(panel, "panel", {
          phase: "error",
          step: info.index + 1,
          total: info.total,
          block: info.blockName || "",
          ready: true,
        });
      }
      const runBtn = document.getElementById("wg-run");
      if (runBtn) runBtn.addEventListener("click", () => window.__wgNext({}));
      const retryBtn = document.getElementById("wg-error-retry");
      if (retryBtn) retryBtn.addEventListener("click", () => window.__wgNext({ __wgRetry: "1" }));
    }, errorPayload)
    .catch(() => {});
}

/**
 * A Block's own explicit instruction.highlights, if it declared any -
 * arbitrary, author-controlled highlight points, independent of verify
 * ("remember this ID" isn't a pass/fail check). Takes priority over
 * anything recovered from verify traits below.
 */
function resolveDeclaredHighlights(block, resultTag) {
  let highlights = block.instruction && block.instruction.highlights;
  if (typeof highlights === "function") {
    try {
      highlights = highlights({ __state: resultTag });
    } catch {
      highlights = [];
    }
  }
  if (!Array.isArray(highlights)) return [];
  return highlights.filter((h) => h && typeof h.selector === "string" && typeof h.label === "string").map((h) => ({
    ...h,
    tone: normalizeHighlightTone(h.tone),
  }));
}

/**
 * Recovers a DOM selector from a built-in Trait's own .name string -
 * visible(sel) / text-equals(sel, "...") - since Trait.check itself is
 * an opaque closure with no selector field of its own. Best-effort only: a
 * hand-written bespoke Trait, or url-matches(...) (no DOM target), yields
 * nothing to highlight, which is fine - the panel still shows the result.
 * Only used as a FALLBACK when the Block declared no explicit
 * instruction.highlights of its own - see resolveDeclaredHighlights.
 */
function extractVerifyHighlights(block, resultTag) {
  const declared = resolveDeclaredHighlights(block, resultTag);
  if (declared.length > 0) return declared;
  let verify = block.instruction && block.instruction.verify;
  if (typeof verify === "function") {
    try {
      verify = verify({ __state: resultTag });
    } catch {
      verify = [];
    }
  }
  if (!Array.isArray(verify)) return [];
  const highlights = [];
  for (const t of verify) {
    const name = t && t.name;
    if (typeof name !== "string") continue;
    let m = /^visible\\((.+)\\)$/.exec(name);
    if (m) {
      highlights.push({ selector: m[1], label: name, tone: "auto" });
      continue;
    }
    m = /^text-equals\\((.+?),\\s*"/.exec(name);
    if (m) {
      highlights.push({ selector: m[1], label: name, tone: "auto" });
      continue;
    }
  }
  return highlights;
}

/**
 * Patches Locator.prototype.fill (via any real locator's own prototype
 * chain - Playwright doesn't export the class directly) so every fill(),
 * regardless of how the Block built that locator (page.locator, chained
 * .getByLabel off a scoped form locator, etc.), highlights the real target
 * first, then types it out character by character instead of snapping the
 * whole value in - "when something is written from mem, it should
 * highlight then slowly input." One-time patch (idempotent - guarded so a
 * multi-step chain doesn't re-wrap an already-wrapped fill).
 */
/**
 * Called once the gate resolves - manual click OR autoplay timeout, both
 * covered from here rather than duplicating this in the in-page click
 * handler - right before the Block's own act() actually starts. Dan: "i
 * want the button, step is running thing. so i wont be able to interrupt
 * the playwright automation" - the "Run this step" button used to sit
 * there still looking clickable for the entire multi-second duration a
 * real act()/observe() takes, inviting a confusing extra click (harmless -
 * __wgNext no-ops once already consumed - but looked live when it wasn't).
 * Disables the button and mem-key textareas, and swaps whichever gate
 * text was showing (manual button or "Auto-advancing...") to "Running...".
 * ALWAYS collapses the panel while act() runs - leaving it expanded was a
 * real bug: #wg-panel sits at z-index max with pointer-events:auto, so
 * Playwright's login/add-to-cart clicks hit the stepper instead of the app
 * ("subtree intercepts pointer events"). Empty/partial fills + a lucky
 * edge click on Login then produced Sauce Demo's Epic sadface, verify
 * still passed on the error banner, and the next block blew up. Collapse
 * also matches Dan's "step is running / can't interrupt" ask. (_opts kept
 * for call-site compat; autoCollapsePanel is now unconditional.)
 */
async function markStepRunning(page, _opts) {
  await page
    .evaluate(() => {
      const runBtn = document.getElementById("wg-run");
      if (runBtn) {
        runBtn.disabled = true;
        runBtn.textContent = "Running \\u25B6";
      }
      const autoEl = document.getElementById("wg-gate-auto");
      if (autoEl) autoEl.textContent = "Running...";
      document.querySelectorAll("#wg-panel textarea[data-key]").forEach((ta) => {
        ta.disabled = true;
      });
      const panel = document.getElementById("wg-panel");
      if (panel) {
        panel.classList.add("wg-collapsed");
        panel.setAttribute("data-wg-collapsed", "1");
        panel.setAttribute("data-wg-phase", "running");
        if (typeof window.__wgStampModal === "function") {
          window.__wgStampModal(panel, "panel", {
            phase: "running",
            ready: true,
          });
        }
        const toggle = panel.querySelector("[data-wg-toggle]");
        if (toggle) toggle.textContent = "Show";
        const titleEl = panel.querySelector(".wg-chrome-title");
        const label = panel.dataset.wgStepLabel;
        if (titleEl && label) titleEl.textContent = label;
        const miniNext = panel.querySelector("[data-wg-mini-next]");
        if (miniNext) {
          miniNext.disabled = true;
          miniNext.classList.remove("wg-mini-next-show");
        }
      }
    })
    .catch(() => {});
}

async function showRing(page, box, label, tone, style) {
  const size = normalizeHighlightSize(style && style.size);
  const weight = normalizeHighlightWeight(style && style.weight);
  const selector = style && style.selector ? String(style.selector) : "";
  const focus = !!(style && style.focus);
  await page
    .evaluate(
      ({ box, label, tone, size, weight, selector, focus }) => {
        if (selector && window.__wgFollowRing) {
          window.__wgFollowRing(selector, label, tone || "planned", { size, weight }, focus);
          return;
        }
        if (window.__wgStopRingFollow) window.__wgStopRingFollow();
        if (window.__wgPositionRing) {
          window.__wgPositionRing(box, label, tone || "planned", { size, weight });
        }
        if (focus && box && window.__wgApplyFocus) window.__wgApplyFocus(box);
        else if (!focus && window.__wgClearFocus) window.__wgClearFocus();
      },
      { box, label, tone: tone || "planned", size, weight, selector, focus },
    )
    .catch(() => {});
}

/** Match a locator to a stubBefore slot by overlapping bounding boxes. */
async function matchStubForLocator(page, locator, stubs) {
  if (!stubs || stubs.length === 0) return null;
  const box = await locator.boundingBox().catch(() => null);
  if (!box) return null;
  for (const s of stubs) {
    try {
      const b = await page.locator(s.selector).first().boundingBox();
      if (
        b &&
        Math.abs(b.x - box.x) < 4 &&
        Math.abs(b.y - box.y) < 4 &&
        Math.abs(b.width - box.width) < 8
      ) {
        return s;
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

/** 0-based stub index for Method fill/click todo advance; -1 if none. */
async function matchStubIndexForLocator(page, locator, stubs) {
  if (!stubs || stubs.length === 0) return -1;
  const box = await locator.boundingBox().catch(() => null);
  if (!box) return -1;
  for (let i = 0; i < stubs.length; i++) {
    const s = stubs[i];
    try {
      const b = await page.locator(s.selector).first().boundingBox();
      if (
        b &&
        Math.abs(b.x - box.x) < 4 &&
        Math.abs(b.y - box.y) < 4 &&
        Math.abs(b.width - box.width) < 8
      ) {
        return i;
      }
    } catch {
      /* skip */
    }
  }
  return -1;
}

/** Flatten dock items in order (sequential groups). */
function flattenTodoDockItems(dock) {
  const items = [];
  if (!dock || !dock.groups) return items;
  for (const g of dock.groups) {
    for (const t of g.items || []) items.push(t);
  }
  return items;
}

/**
 * Resolve which todo index a matched stub should advance to.
 * Prefer stub.todo / stub.slotId / stub.id against item.id; never jump backward.
 */
function resolveTodoAdvanceIndex(dock, stub, stubIndex) {
  const items = flattenTodoDockItems(dock);
  if (!items.length) return stubIndex;
  const curIdx = items.findIndex((t) => t.current);
  let idx = stubIndex;
  const key = stub && (stub.todo || stub.slotId || stub.id);
  if (key) {
    const k = String(key).trim().toLowerCase();
    let found = items.findIndex((t) => t.id && String(t.id).toLowerCase() === k);
    if (found < 0) {
      // username -> login-user, password -> login-pass, submit -> login-submit
      const aliases = {
        username: ["login-user", "user", "email"],
        password: ["login-pass", "pass"],
        submit: ["login-submit", "login", "tap-login"],
        user: ["login-user", "username"],
        pass: ["login-pass", "password"],
      };
      const alts = aliases[k] || [];
      for (const a of alts) {
        found = items.findIndex((t) => t.id && String(t.id).toLowerCase() === a);
        if (found >= 0) break;
      }
    }
    if (found < 0) {
      found = items.findIndex(
        (t) =>
          (t.id && String(t.id).toLowerCase().includes(k)) ||
          (t.text && String(t.text).toLowerCase().includes(k)),
      );
    }
    if (found >= 0) idx = found;
  }
  // Monotonic: never retreat the walkthrough.
  if (curIdx >= 0 && idx < curIdx) idx = curIdx;
  return idx;
}

/** Advance sequential todo dock to stubIndex and push to the page (Method act). */
async function syncTodoDockAdvance(page, todoDockRef, stubIndex, stub) {
  if (!todoDockRef || stubIndex < 0) return;
  const prev = todoDockRef.current;
  if (!prev) return;
  const idx = resolveTodoAdvanceIndex(prev, stub || null, stubIndex);
  const advanced = advanceTodoDock(prev, idx);
  todoDockRef.current = advanced;
  demoLog(
    "  todo advance -> idx=" +
      idx +
      (stub && (stub.slotId || stub.todo)
        ? " slot=" + (stub.todo || stub.slotId)
        : " stub#" + stubIndex) +
      ' current="' +
      String(
        (flattenTodoDockItems(advanced).find((t) => t.current) || {}).text || "",
      ).slice(0, 40) +
      '"',
  );
  await page
    .evaluate((dock) => {
      if (window.__wgSyncTodos) {
        window.__wgSyncTodos({ sync: "set", dock });
      }
    }, advanced)
    .catch(() => {});
}

async function captionForLocator(page, locator, stubs, fallback) {
  const matched = await matchStubForLocator(page, locator, stubs);
  if (matched) {
    return {
      label: formatHighlightCaption(matched),
      tone: normalizeHighlightTone(matched.tone),
      size: normalizeHighlightSize(matched.size),
      weight: normalizeHighlightWeight(matched.weight),
    };
  }
  return { label: fallback, tone: "auto", size: "md", weight: "normal" };
}

async function dwellMatchedStub(page, locator, stubs, pacing) {
  const matched = await matchStubForLocator(page, locator, stubs);
  if (!matched) return;
  const ms = resolveFixtureDwellMs(matched, {
    gatesFast: !!(pacing && pacing.gatesFast),
    pace: pacing && pacing.demoPace,
  });
  if (ms != null && ms > 0) {
    await new Promise((res) => setTimeout(res, ms));
  }
}

/**
 * Multi-step yap captions - not block lifecycle. Each slide waits for Next
 * (or auto-next), optional ring via slide.selector.
 *
 * Advance wait does NOT use exposeFunction/gate(): after a real navigation
 * (e.g. finish-order -> checkout-complete) the panel can render while
 * __wgNext is momentarily wedged, which left "Next slide" looking live but
 * doing nothing. In-page data-wg-acked + autoplay poll is the source of truth.
 */
async function presentSlides(page, slides, _gate, opts) {
  const title = (opts && opts.title) || "waygraph demo";
  const blockName = (opts && opts.blockName) || "";
  const episodeNumber = opts && opts.episodeNumber;
  const episodeTitle = (opts && opts.episodeTitle) || "";
  const gatesFast = !!(opts && opts.fast);
  const demoPace = normalizeDemoPace((opts && opts.pace) || (gatesFast ? "fast" : "normal"));
  const baseAutoplay =
    opts && opts.autoplayMs
      ? Number(opts.autoplayMs)
      : process.env.WAYGRAPH_AUTOPLAY_MS
        ? Number(process.env.WAYGRAPH_AUTOPLAY_MS)
        : 1800;
  const autoplayMs = demoPaceGateMs(demoPace, baseAutoplay);
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const caption = formatHighlightCaption(s);
    const slideTone = normalizeHighlightTone(s.tone);
    const slideStyle = {
      size: normalizeHighlightSize(s.size),
      weight: normalizeHighlightWeight(s.weight),
    };
    const isLast = i === slides.length - 1;
    const dwellMs = resolveFixtureDwellMs(s, { gatesFast, pace: demoPace });
    await installOverlay(page, title);
    if (s.selector) {
      try {
        await ensureSelectorInView(page, s.selector);
        await applyHighlightZoom(page, s.selector, s.zoom, s.zoomOut);
        const box = await page
          .evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          }, s.selector)
          .catch(() => null);
        if (box && box.width > 0 && box.height > 0) {
          await showRing(page, box, caption, slideTone, {
            ...slideStyle,
            selector: s.selector,
            focus: !!s.focus,
          });
        }
      } catch {
        await hideRing(page);
      }
    } else {
      await hideRing(page);
    }
    await page.evaluate(
      (info) => {
        let panel = document.getElementById("wg-panel");
        const isNew = !panel;
        if (!panel) {
          panel = document.createElement("div");
          panel.id = "wg-panel";
        }
        panel.classList.remove("wg-error", "wg-expected");
        // Do not clear wg-collapsed - WirePanelChrome honors Hide (localStorage)
        // unless forceCollapsed:true (--mini / --video).
        const esc = (t) =>
          String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
        const episodeLine =
          info.episodeNumber !== undefined && info.episodeNumber !== null
            ? "<div class=\\"wg-episode\\">Episode " +
              info.episodeNumber +
              (info.episodeTitle ? ": " + esc(info.episodeTitle) : "") +
              " · yap slides</div>"
            : "";
        const paceHtml =
          info.paceBadge || info.paceLabel
            ? "<div class=\\"wg-pace\\" data-pace-kind=\\"" +
              esc(info.paceKind || "normal") +
              "\\"><span class=\\"wg-pace-badge\\">" +
              esc(info.paceBadge || "1x") +
              "</span><span>" +
              esc(info.paceLabel || "") +
              "</span></div>"
            : "";
        panel.innerHTML =
          "<div class=\\"wg-chrome\\"><span class=\\"wg-chrome-title\\">waygraph demo</span>" +
          "<button type=\\"button\\" class=\\"wg-hide-btn\\" data-wg-toggle=\\"1\\">Hide</button></div>" +
          "<div class=\\"wg-body\\">" +
          episodeLine +
          paceHtml +
          "<h3>Slide " +
          (info.index + 1) +
          " / " +
          info.total +
          (info.blockName ? " · " + esc(info.blockName) : "") +
          "</h3>" +
          (info.tag
            ? "<div style=\\"border:none;padding:0;margin:0 0 6px;font-size:11px;color:#c9a6ff\\">" +
              esc(info.tag) +
              "</div>"
            : "") +
          "<div class=\\"wg-narration\\">" +
          esc(info.caption) +
          "</div>" +
          (info.detail
            ? "<div class=\\"wg-result-pretty\\" style=\\"margin:0 0 12px;color:#f0e8ff\\">" +
              esc(info.detail) +
              "</div>"
            : "") +
          (info.dwellMs != null
            ? "<div class=\\"wg-auto\\" id=\\"wg-dwell-hint\\" style=\\"margin:0 0 8px\\">Hold " +
              (info.dwellMs / 1000).toFixed(1) +
              "s before next...</div>"
            : "") +
          "<div class=\\"wg-autoplay-row\\"><label><input type=\\"checkbox\\" id=\\"wg-autoplay-cb\\"" +
          (info.autoNow ? " checked" : "") +
          "> Auto-advance</label></div>" +
          "<div id=\\"wg-gate-manual\\"" +
          (info.autoNow ? " style=\\"display:none\\"" : "") +
          "><button type=\\"button\\" id=\\"wg-run\\"" +
          (info.dwellMs != null ? " disabled" : "") +
          ">" +
          (info.isLast ? "Continue \\u25B6" : "Next slide \\u25B6") +
          "</button></div>" +
          "<div id=\\"wg-gate-auto\\" class=\\"wg-auto\\"" +
          (info.autoNow ? "" : " style=\\"display:none\\"") +
          ">Auto-advancing...</div>" +
          "</div>";
        if (isNew) {
          document.documentElement.appendChild(panel);
          requestAnimationFrame(() => panel.classList.add("wg-in"));
        }
        if (window.__wgWirePanelChrome) {
          window.__wgWirePanelChrome(panel, "wg-panel-hidden", "waygraph demo", {
            stepLabel:
              (info.episodeNumber !== undefined && info.episodeNumber !== null
                ? "Ep " + info.episodeNumber + " \\u00b7 "
                : "") +
              "Slide " +
              (info.index + 1) +
              " / " +
              info.total +
              (info.blockName ? " \\u00b7 " + info.blockName : ""),
            // Video / --mini: compact pill. Else omit so Hide sticks.
            forceCollapsed: info.forceCollapsed === true ? true : undefined,
          });
        }
        if (window.__wgStampModal) {
          window.__wgStampModal(panel, "panel", {
            phase: "slide",
            step: info.index + 1,
            total: info.total,
            block: info.blockName || "",
            ready: true,
          });
        }
        let autoNow = false;
        try {
          autoNow = localStorage.getItem("wg-autoplay") === "1";
        } catch {
          /* ignore */
        }
        const cb = document.getElementById("wg-autoplay-cb");
        if (cb) {
          cb.checked = autoNow;
          cb.addEventListener("change", () => {
            try {
              localStorage.setItem("wg-autoplay", cb.checked ? "1" : "0");
            } catch {
              /* ignore */
            }
            const manual = document.getElementById("wg-gate-manual");
            const auto = document.getElementById("wg-gate-auto");
            if (manual) manual.style.display = cb.checked ? "none" : "";
            if (auto) auto.style.display = cb.checked ? "" : "none";
          });
        }
        const manual = document.getElementById("wg-gate-manual");
        const auto = document.getElementById("wg-gate-auto");
        if (manual) manual.style.display = autoNow ? "none" : "";
        if (auto) auto.style.display = autoNow ? "" : "none";
        const runBtn = document.getElementById("wg-run");
        if (runBtn) {
          runBtn.removeAttribute("data-wg-acked");
          runBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (runBtn.disabled) return;
            runBtn.setAttribute("data-wg-acked", "1");
          });
        }
        if (info.dwellMs != null && info.dwellMs > 0) {
          const unlockAt = Date.now() + info.dwellMs;
          const tick = () => {
            const left = Math.max(0, unlockAt - Date.now());
            const hint = document.getElementById("wg-dwell-hint");
            const btn = document.getElementById("wg-run");
            if (left <= 0) {
              if (hint) hint.remove();
              if (btn) btn.disabled = false;
              return;
            }
            if (hint) hint.textContent = "Hold " + (left / 1000).toFixed(1) + "s before next...";
            setTimeout(tick, 100);
          };
          setTimeout(tick, 100);
        }
      },
      {
        index: i,
        total: slides.length,
        caption: s.caption,
        detail: s.detail || "",
        tag: s.tag || "",
        blockName,
        isLast,
        autoNow: false,
        dwellMs,
        episodeNumber: episodeNumber !== undefined ? episodeNumber : null,
        episodeTitle,
        paceBadge: formatDemoPaceBadge(demoPace, baseAutoplay),
        paceLabel: formatDemoPaceLabel(demoPace, baseAutoplay),
        paceKind: demoPaceKind(demoPace),
        forceCollapsed:
          !!process.env.WAYGRAPH_VIDEO ||
          process.env.WAYGRAPH_MINI === "1" ||
          process.env.WAYGRAPH_STEPPER_MINI === "1"
            ? true
            : undefined,
      },
    );
    const started = Date.now();
    // When duration is set: floor both manual Next and auto-next to dwellMs.
    // When unset: legacy - auto uses autoplayMs, manual Next is immediate.
    const autoWaitMs = dwellMs != null ? dwellMs : autoplayMs;
    for (;;) {
      const acked = await page
        .evaluate(() => {
          const btn = document.getElementById("wg-run");
          return !!(btn && btn.getAttribute("data-wg-acked") === "1");
        })
        .catch(() => false);
      if (acked) {
        if (dwellMs == null || Date.now() - started >= dwellMs) break;
      }
      const auto = await page
        .evaluate(() => {
          try {
            return localStorage.getItem("wg-autoplay") === "1";
          } catch {
            return false;
          }
        })
        .catch(() => false);
      if (auto && Date.now() - started >= autoWaitMs) break;
      await new Promise((res) => setTimeout(res, 100));
    }
  }
  await hideRing(page);
}

function demoPaceKind(pace) {
  const p = normalizeDemoPace(pace);
  if (typeof p === "number" && p > 20) return "ms";
  if (typeof p === "number") return demoPaceIsSlow(p) ? "num-slow" : demoPaceIsFast(p) ? "fast" : "normal";
  if (p === "blitz" || p === "fast" || p === "slow") return p;
  return "normal";
}

function paceSpeakFields(pace, baseAutoplayMs) {
  const p = normalizeDemoPace(pace);
  const base = Number.isFinite(baseAutoplayMs) && baseAutoplayMs > 0 ? baseAutoplayMs : 1800;
  return {
    pace: p,
    paceBadge: formatDemoPaceBadge(p, base),
    paceLabel: formatDemoPaceLabel(p, base),
    paceKind: demoPaceKind(p),
  };
}

/** Demo CLI chatter (agents use this to ballpark timing / todo layout). Off for WAYGRAPH_JSON. */
function demoQuiet() {
  return process.env.WAYGRAPH_JSON === "1";
}
function demoColorEnabled() {
  // FORCE_COLOR wins (agents/CI often set NO_COLOR=1).
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") return true;
  if (process.env.NO_COLOR === "1" || process.env.NO_COLOR === "true") return false;
  if (process.env.FORCE_COLOR === "0") return false;
  return !!(
    (process.stderr && process.stderr.isTTY) ||
    (process.stdout && process.stdout.isTTY)
  );
}
const ESC = String.fromCharCode(27);
const ANSI = {
  reset: ESC + "[0m",
  bold: ESC + "[1m",
  dim: ESC + "[2m",
  purple: ESC + "[38;5;141m",
  blue: ESC + "[38;5;75m",
  yellow: ESC + "[38;5;220m",
  red: ESC + "[38;5;203m",
  green: ESC + "[38;5;114m",
  gray: ESC + "[38;5;246m",
  cyan: ESC + "[38;5;87m",
  magenta: ESC + "[38;5;213m",
  white: ESC + "[37m",
};
function ansiPaint(code, text) {
  if (!demoColorEnabled() || text == null || text === "") return String(text ?? "");
  return code + String(text) + ANSI.reset;
}
function toneAnsi(tone) {
  const t = normalizeHighlightTone(tone);
  if (t === "info") return ANSI.blue;
  if (t === "warning") return ANSI.yellow;
  if (t === "danger") return ANSI.red;
  if (t === "success") return ANSI.green;
  if (t === "auto") return ANSI.gray;
  return ANSI.purple;
}
function toneName(tone) {
  const t = normalizeHighlightTone(tone);
  if (t === "info") return "BLUE";
  if (t === "warning") return "YELLOW";
  if (t === "danger") return "RED";
  if (t === "success") return "GREEN";
  if (t === "auto") return "GRAY";
  return "PURPLE";
}
/** Optional authored CSS color (#rrggbb) -> truecolor ANSI when TTY. */
function hexAnsi(hex) {
  if (!hex || typeof hex !== "string") return null;
  const m = String(hex).trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return ESC + "[38;2;" + r + ";" + g + ";" + b + "m";
}
function demoTs() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return (
    p(d.getHours()) +
    ":" +
    p(d.getMinutes()) +
    ":" +
    p(d.getSeconds()) +
    "." +
    ms
  );
}
function demoPrefix() {
  return ansiPaint(ANSI.dim, "[" + demoTs() + "]") + " waygraph demo: ";
}
function demoLog(msg) {
  if (demoQuiet()) return;
  console.log(demoPrefix() + msg);
}
/** Fixture catch-all: how it was called + value. */
function demoFixture(kind, call, value) {
  if (demoQuiet()) return;
  const head = ansiPaint(ANSI.cyan, "FIXTURE") + " " + ansiPaint(ANSI.bold, kind);
  const callPart = call ? " " + ansiPaint(ANSI.dim, call) : "";
  let val = "";
  if (value !== undefined) {
    if (typeof value === "string") val = value;
    else {
      try {
        val = JSON.stringify(value);
      } catch {
        val = String(value);
      }
    }
    if (val.length > 220) val = val.slice(0, 217) + "...";
    val = " = " + ansiPaint(ANSI.white, val);
  }
  console.log(demoPrefix() + head + callPart + val);
}
/** Highlight trigger line: PURPLE · Cart items - Product landed in cart */
function demoHighlight(h, extra) {
  if (demoQuiet()) return;
  const tone = h && h.tone != null ? h.tone : "planned";
  const paint = hexAnsi(h && h.color) || toneAnsi(tone);
  const name = toneName(tone);
  const label = String((h && h.label) || "").trim() || "(no label)";
  const sel = h && h.selector ? String(h.selector) : "";
  const bits = [];
  if (h && h.focus) bits.push("focus");
  if (h && h.zoom != null && Number(h.zoom) > 1) bits.push("zoom=" + h.zoom);
  if (h && h.zoomOut === false) bits.push("zoomOut=false");
  if (h && h.gesture) bits.push("gesture=" + h.gesture);
  if (h && h.weight && h.weight !== "normal") bits.push("weight=" + h.weight);
  if (h && h.size && h.size !== "md") bits.push("size=" + h.size);
  if (h && h.color) bits.push("color=" + h.color);
  if (extra) bits.push(extra);
  const line =
    ansiPaint(paint, name) +
    " · " +
    ansiPaint(paint, label) +
    (sel ? ansiPaint(ANSI.dim, "  sel=" + sel) : "") +
    (bits.length ? ansiPaint(ANSI.dim, "  [" + bits.join(" ") + "]") : "");
  console.log(demoPrefix() + ansiPaint(ANSI.magenta, "HIGHLIGHT") + " " + line);
}
function logStubPhaseFixtures(phaseName, phase) {
  if (demoQuiet() || !phase) return;
  const tag = "stub." + phaseName;
  if (phase.title) demoFixture(tag, "ctx.title(...)", JSON.stringify(phase.title));
  if (phase.banner) demoFixture(tag, "ctx.banner(...)", JSON.stringify(phase.banner));
  if (phase.deviceSync && phase.deviceSync !== "keep") {
    demoFixture(
      tag,
      phase.deviceSync === "clear" ? "ctx.clearDevice()" : "ctx.device(...)",
      phase.device
        ? {
            preset: phase.device.preset,
            w: phase.device.viewport && phase.device.viewport.width,
            h: phase.device.viewport && phase.device.viewport.height,
            orient: phase.device.orientation,
            touch: !!phase.device.touchMode,
          }
        : phase.deviceSync,
    );
  }
  if (phase.zoom != null) demoFixture(tag, "ctx.zoom(" + phase.zoom + ")", phase.zoom + "x");
  if (phase.zoomOut !== undefined) demoFixture(tag, "ctx.zoomOut(" + !!phase.zoomOut + ")", !!phase.zoomOut);
  if (phase.todoSync && phase.todoSync !== "keep") {
    demoFixture(
      tag,
      phase.todoSync === "clear" ? "ctx.hideTodos() / clear" : "ctx.todos(...)",
      phase.todoDock
        ? {
            id: phase.todoDock.id,
            pos: phase.todoDock.pos,
            title: phase.todoDock.title,
            n: (phase.todos && phase.todos.length) || 0,
          }
        : phase.todoSync,
    );
  }
  const rings = phase.highlights || [];
  for (let i = 0; i < rings.length; i++) {
    const h = rings[i];
    demoFixture(
      tag,
      "ctx.ring/highlights[" + i + "]",
      {
        selector: h.selector,
        label: h.label || h.caption,
        detail: h.detail,
        tone: h.tone || "planned",
        color: h.color,
        focus: !!h.focus,
        zoom: h.zoom,
        zoomOut: h.zoomOut,
        gesture: h.gesture,
        duration: h.duration,
      },
    );
  }
  if (phase.slides && phase.slides.length) {
    demoFixture(tag, "ctx.slides(...)", { n: phase.slides.length });
  }
}
function summarizeTodoDock(dock) {
  if (!dock) return "todos=none";
  const id = dock.id || "_default";
  const pos = dock.pos || "left";
  const style = dock.style || "sequential";
  const title = dock.title ? String(dock.title) : "";
  const items = [];
  for (const g of dock.groups || []) {
    for (const t of g.items || []) items.push(t);
  }
  const cur = items.find((t) => t.current);
  const done = items.filter((t) => t.done).length;
  return (
    "todos id=" +
    id +
    " pos=" +
    pos +
    " style=" +
    style +
    (title ? ' title="' + title + '"' : "") +
    " n=" +
    items.length +
    " done=" +
    done +
    (cur && cur.text ? ' current="' + String(cur.text).slice(0, 48) + '"' : "")
  );
}
/** Full todo dump for agents (every group/item id + flags). */
function logTodoDockFull(dock, tag) {
  const prefix = tag ? tag + " " : "";
  if (!dock) {
    demoLog(prefix + "todos=none");
    return;
  }
  demoLog(prefix + summarizeTodoDock(dock));
  const groups = dock.groups || [];
  if (!groups.length) {
    demoLog(prefix + "  (no groups)");
    return;
  }
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const gLabel =
      "group[" +
      gi +
      "]" +
      (g.id ? " id=" + g.id : "") +
      (g.title ? ' title="' + String(g.title).slice(0, 40) + '"' : "") +
      (g.style ? " style=" + g.style : "");
    demoLog(prefix + "  " + gLabel);
    const items = g.items || [];
    for (let ti = 0; ti < items.length; ti++) {
      const t = items[ti];
      const mark = t.done ? "done" : t.current ? "CURRENT" : "pending";
      demoLog(
        prefix +
          "    [" +
          ti +
          "] " +
          mark +
          (t.id ? " id=" + t.id : "") +
          ' text="' +
          String(t.text || "").slice(0, 80) +
          '"' +
          (t.detail ? ' detail="' + String(t.detail).slice(0, 40) + '"' : ""),
      );
    }
  }
}
function summarizeDevice(d) {
  if (!d) return "device=none";
  const vp = d.viewport || {};
  return (
    "device=" +
    (d.preset || "?") +
    " " +
    (vp.width || "?") +
    "x" +
    (vp.height || "?") +
    " " +
    (d.orientation || "?") +
    (d.touchMode ? " touch" : "")
  );
}
async function probeTodoDocksOnPage(page) {
  return page
    .evaluate(() => {
      const docks = [...document.querySelectorAll(".wg-todo-dock, #wg-todo-dock")];
      return docks.map((el) => {
        const r = el.getBoundingClientRect();
        const items = el.querySelectorAll("li");
        let current = "";
        items.forEach((li) => {
          if (li.classList.contains("wg-todo-current")) {
            current = (li.textContent || "").replace(/\s+/g, " ").trim().slice(0, 48);
          }
        });
        return {
          key: el.getAttribute("data-wg-todo-key") || el.id || "?",
          pos: el.dataset.pos || "?",
          top: Math.round(r.top),
          left: Math.round(r.left),
          w: Math.round(r.width),
          h: Math.round(r.height),
          onScreen: r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth,
          n: items.length,
          current,
        };
      });
    })
    .catch(() => []);
}

async function hideRing(page) {
  await page
    .evaluate(() => {
      if (window.__wgHideRing) window.__wgHideRing();
    })
    .catch(() => {});
}

/**
 * Real navigation wipes document + overlay helpers. Reinstall and re-paint
 * carried todos / device / optional stubBefore ring so keep-dock and nav
 * highlights do not vanish until the next ctx.todos() / stubAfter (PIA #15).
 */
async function restoreTheaterAfterNavigation(page, todoDockRef, deviceRef, stubBeforeRef) {
  const needs =
    (await page
      .evaluate(() => !window.__wgSyncTodos || !document.getElementById("wg-ring"))
      .catch(() => true)) || false;
  if (!needs) {
    // Overlay survived (SPA / no full document wipe) - still refresh dock
    // if Node has a carry and the DOM lost .wg-todo-dock.
    const hasDock = await page
      .evaluate(() => !!document.querySelector(".wg-todo-dock, #wg-todo-dock"))
      .catch(() => false);
    if (hasDock || !todoDockRef || !todoDockRef.current) return;
  }
  await installOverlay(page);
  const dock = todoDockRef && todoDockRef.current;
  if (dock) {
    await page
      .evaluate((d) => {
        if (window.__wgSyncTodos) window.__wgSyncTodos({ sync: "set", dock: d });
      }, dock)
      .catch(() => {});
  }
  if (deviceRef && deviceRef.current) {
    await applyDeviceToPage(page, deviceRef.current, "set").catch(() => {});
  }
  // Re-show first matching stubBefore ring if selector still exists (sidebar
  // nav targets often survive the route change).
  const stubs = (stubBeforeRef && stubBeforeRef.current) || [];
  for (const h of stubs) {
    if (!h || !h.selector) continue;
    const box = await page
      .evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return null;
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }, h.selector)
      .catch(() => null);
    if (box) {
      await showRing(page, box, formatHighlightCaption(h), h.tone || "planned", {
        size: h.size,
        weight: h.weight,
        selector: h.selector,
        focus: !!h.focus,
      }).catch(() => {});
      break;
    }
  }
}

/**
 * Removes every overlay element (panel, ring, ring-label, cursor,
 * click-pulse, banner) and stops the live resize/scroll ring tracker, once
 * the whole chain is genuinely done - "I want to see the same page just
 * like the demo opened for the first time," not the last step's panel and
 * highlight ring stuck over the real app forever. installOverlay only ever
 * ADDS these elements back on demand (idempotent, per-page-load) - nothing
 * re-creates them once torn down here unless another Block/fill/click runs.
 */
async function teardownOverlay(page) {
  await page
    .evaluate(() => {
      if (window.__wgRingTrack) {
        window.removeEventListener("resize", window.__wgRingTrack);
        window.removeEventListener("scroll", window.__wgRingTrack, true);
        window.__wgRingTrack = null;
      }
      window.__wgNarrateOwnsRing = false;
      for (const id of [
        "wg-panel",
        "wg-ring",
        "wg-ring-label",
        "wg-cursor",
        "wg-click-pulse",
        "wg-banner",
        "wg-todo-dock",
        "wg-device-shell",
        "wg-device-toast",
        "wg-device-badge",
      ]) {
        const el = document.getElementById(id);
        if (el) el.remove();
      }
      document.querySelectorAll(".wg-todo-dock").forEach((el) => el.remove());
      document.documentElement.classList.remove("wg-video-device-stage");
    })
    .catch(() => {});
}

async function moveCursorTo(page, box, ms) {
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const travel = Math.max(0, Number(ms) || 0);
  await page
    .evaluate(({ x, y, ms }) => {
      if (window.__wgMoveCursorTo) window.__wgMoveCursorTo(x, y, ms);
    }, { x, y, ms: travel })
    .catch(() => {});
  // CSS transition is async - wait the full travel so the cursor is ON the
  // target before ring/pulse/real click (NavBlock click nav was skipping
  // this and looked like a teleport).
  if (travel > 0) {
    await new Promise((res) => setTimeout(res, travel));
  }
  return { x, y };
}

async function clickPulseAt(page, x, y, tone) {
  await page
    .evaluate(({ x, y, tone }) => {
      if (window.__wgClickPulse) window.__wgClickPulse(x, y, tone || "planned");
    }, { x, y, tone: tone || "planned" })
    .catch(() => {});
}

/**
 * Touch swipe trail (mobile/tablet). dir: left|right|up|down.
 * Returns after the trail animation completes.
 * Self-contained when overlay helper is not installed yet (device runs before panel).
 */
async function playSwipeTrail(page, opts) {
  const o = opts || {};
  const waitMs = await page
    .evaluate((payload) => {
      if (typeof window.__wgSwipeTrail === "function") {
        return window.__wgSwipeTrail(payload);
      }
      // Fallback: inject a one-shot trail without full overlay install.
      const dir =
        payload.dir === "right" || payload.dir === "up" || payload.dir === "down"
          ? payload.dir
          : "left";
      const ms = Math.max(280, Math.min(1400, Number(payload.ms) || 720));
      const label = payload.label || "swipe";
      let layer = document.getElementById("wg-swipe-layer");
      if (layer) layer.remove();
      layer = document.createElement("div");
      layer.id = "wg-swipe-layer";
      layer.setAttribute("data-wg-ui", "1");
      layer.style.cssText =
        "position:fixed;inset:0;z-index:2147483646;pointer-events:none;overflow:hidden;";
      const finger = document.createElement("div");
      finger.style.cssText =
        "position:absolute;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;" +
        "background:rgba(15,23,42,.92);border:2px solid #fff;box-shadow:0 4px 16px rgba(0,0,0,.4);";
      const lab = document.createElement("div");
      lab.textContent = label;
      lab.style.cssText =
        "position:absolute;left:50%;top:18%;transform:translateX(-50%);padding:6px 12px;" +
        "border-radius:999px;background:rgba(15,23,42,.88);color:#e0f2fe;" +
        "border:1px solid rgba(56,189,248,.55);font:700 12px/1.2 system-ui,sans-serif;";
      layer.appendChild(lab);
      layer.appendChild(finger);
      document.documentElement.appendChild(layer);
      const vw = window.innerWidth || 390;
      const vh = window.innerHeight || 844;
      const pad = Math.min(vw, vh) * 0.18;
      let x0;
      let y0;
      let x1;
      let y1;
      if (dir === "left") {
        x0 = vw - pad;
        x1 = pad;
        y0 = y1 = vh * 0.52;
      } else if (dir === "right") {
        x0 = pad;
        x1 = vw - pad;
        y0 = y1 = vh * 0.52;
      } else if (dir === "up") {
        x0 = x1 = vw * 0.5;
        y0 = vh - pad;
        y1 = pad;
      } else {
        x0 = x1 = vw * 0.5;
        y0 = pad;
        y1 = vh - pad;
      }
      finger.style.left = x0 + "px";
      finger.style.top = y0 + "px";
      const steps = 12;
      const stepMs = Math.floor(ms / steps);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const e = t * t * (3 - 2 * t);
        const x = x0 + (x1 - x0) * e;
        const y = y0 + (y1 - y0) * e;
        setTimeout(() => {
          finger.style.left = x + "px";
          finger.style.top = y + "px";
          const dot = document.createElement("div");
          dot.style.cssText =
            "position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;" +
            "background:rgba(147,197,253,.55);border:2px solid rgba(255,255,255,.85);left:" +
            x +
            "px;top:" +
            y +
            "px;opacity:" +
            (0.85 - t * 0.55) +
            ";transition:opacity .45s ease,transform .45s ease;";
          layer.appendChild(dot);
          requestAnimationFrame(() => {
            dot.style.opacity = "0";
            dot.style.transform = "scale(1.8)";
          });
          if (i === steps) {
            setTimeout(() => {
              const el = document.getElementById("wg-swipe-layer");
              if (el) el.remove();
            }, 400);
          }
        }, i * stepMs);
      }
      return ms + 120;
    }, {
      dir: o.dir || "left",
      label: o.label || "swipe",
      hint: o.hint || "",
      ms: o.ms || 720,
    })
    .catch(() => 0);
  const n = Number(waitMs) || 0;
  if (n > 0) await new Promise((r) => setTimeout(r, n));
}

/**
 * Fit + center the OS browser window on the device viewport so mobile/tablet
 * is not stuck top-left inside a maximized frame (Dan 0.13.4).
 * Desktop clear restores maximized.
 */
async function fitWindowToDeviceViewport(page, viewport, opts) {
  const maximize = !!(opts && opts.maximize);
  let client;
  try {
    client = await page.context().newCDPSession(page);
    const { windowId } = await client.send("Browser.getWindowForTarget");
    if (maximize) {
      await client.send("Browser.setWindowBounds", {
        windowId,
        bounds: { windowState: "maximized" },
      });
      return;
    }
    if (!viewport || !viewport.width || !viewport.height) return;
    const metrics = await page
      .evaluate(() => {
        const chromeW = Math.max(0, (window.outerWidth || 0) - (window.innerWidth || 0));
        const chromeH = Math.max(0, (window.outerHeight || 0) - (window.innerHeight || 0));
        return {
          chromeW: Number.isFinite(chromeW) ? chromeW : 0,
          // First paint after maximize often reports 0 chrome - use a floor.
          chromeH: chromeH > 20 ? chromeH : 88,
          screenW: window.screen.availWidth || 1920,
          screenH: window.screen.availHeight || 1080,
        };
      })
      .catch(() => ({ chromeW: 0, chromeH: 88, screenW: 1920, screenH: 1080 }));
    // Leave maximized before setting pixel bounds (Chromium ignores size while max).
    await client.send("Browser.setWindowBounds", {
      windowId,
      bounds: { windowState: "normal" },
    });
    const winW = Math.min(
      metrics.screenW,
      Math.max(320, Math.floor(viewport.width + metrics.chromeW)),
    );
    const winH = Math.min(
      metrics.screenH,
      Math.max(320, Math.floor(viewport.height + metrics.chromeH)),
    );
    const left = Math.max(0, Math.floor((metrics.screenW - winW) / 2));
    const top = Math.max(0, Math.floor((metrics.screenH - winH) / 2));
    await client.send("Browser.setWindowBounds", {
      windowId,
      bounds: {
        windowState: "normal",
        left,
        top,
        width: winW,
        height: winH,
      },
    });
  } catch {
    /* headless / no window - ignore */
  } finally {
    if (client) await client.detach().catch(() => {});
  }
}

/**
 * Video recording locks Playwright viewport to recordVideo.size. Shrinking
 * setViewportSize to mobile/tablet letterboxes the .webm top-left. Instead keep
 * the stage size and center a device-sized #wg-device-shell inside the frame.
 */
async function applyVideoDeviceStage(page, target, stage, opts) {
  const clear = !!(opts && opts.clear);
  const shutterOut = !!(opts && opts.shutterOut);
  const enterIn = !!(opts && opts.enterIn);
  const desktopFlat = !!(opts && (opts.desktopFlat || opts.shutterOut));
  const result = await page
    .evaluate(
      ({ tw, th, sw, sh, clear, shutterOut, enterIn, desktopFlat }) => {
        const MATTE = "#0b1220";
        const unwrap = () => {
          const shell = document.getElementById("wg-device-shell");
          if (shell) {
            const parent = shell.parentNode;
            if (parent) {
              while (shell.firstChild) parent.insertBefore(shell.firstChild, shell);
            }
            shell.remove();
          }
          document.documentElement.classList.remove("wg-video-device-stage");
          document.documentElement.style.removeProperty("background");
          const b = document.body;
          if (b) {
            b.style.margin = "";
            b.style.minHeight = "";
            b.style.display = "";
            b.style.alignItems = "";
            b.style.justifyContent = "";
            b.style.background = "";
            b.style.overflow = "";
          }
        };
        if (clear) {
          unwrap();
          return { waitMs: 0 };
        }
        if (!document.body) return { waitMs: 0 };
        document.documentElement.classList.add("wg-video-device-stage");
        document.documentElement.style.background = MATTE;
        document.body.style.margin = "0";
        document.body.style.minHeight = "100vh";
        document.body.style.display = "flex";
        document.body.style.alignItems = "center";
        document.body.style.justifyContent = "center";
        document.body.style.background = MATTE;
        document.body.style.overflow = "hidden";

        let shell = document.getElementById("wg-device-shell");
        const created = !shell;
        if (!shell) {
          shell = document.createElement("div");
          shell.id = "wg-device-shell";
          const move = [];
          for (const child of [...document.body.childNodes]) {
            if (
              child.nodeType === 1 &&
              child.getAttribute &&
              child.getAttribute("data-wg-ui") === "1"
            ) {
              continue;
            }
            if (child.nodeType === 1 && child.id === "wg-device-shell") continue;
            move.push(child);
          }
          for (const n of move) shell.appendChild(n);
          document.body.appendChild(shell);
        }
        // Desktop flat: always full-bleed, never reintroduce bezel on overlay rebuild.
        if (desktopFlat) {
          shell.classList.remove("wg-shell-enter");
          shell.classList.add("wg-shell-shutter-out");
          shell.classList.add("wg-shell-desktop-flat");
          shell.style.width = sw + "px";
          shell.style.height = sh + "px";
          shell.style.maxWidth = sw + "px";
          shell.style.maxHeight = sh + "px";
          shell.style.transform = "scale(1)";
          shell.style.transformOrigin = "center center";
          shell.style.borderRadius = "0";
          shell.style.boxShadow = "none";
          shell.style.border = "none";
          shell.style.outline = "none";
          return { waitMs: shutterOut ? 480 : 0 };
        }
        // Leaving desktop-flat: clear INLINE radius/shadow overrides so CSS
        // border-radius:16px applies evenly on all corners again.
        shell.style.removeProperty("border-radius");
        shell.style.removeProperty("box-shadow");
        shell.style.removeProperty("border");
        shell.style.removeProperty("outline");
        if (enterIn && (created || shell.classList.contains("wg-shell-shutter-out"))) {
          shell.classList.remove("wg-shell-shutter-out");
          shell.classList.remove("wg-shell-desktop-flat");
          shell.classList.add("wg-shell-enter");
          void shell.offsetWidth;
        }
        const scale = Math.min(sw / tw, sh / th) * 0.92;
        shell.style.width = tw + "px";
        shell.style.height = th + "px";
        shell.style.maxWidth = tw + "px";
        shell.style.maxHeight = th + "px";
        shell.style.transform = "scale(" + scale + ")";
        shell.style.transformOrigin = "center center";
        shell.classList.remove("wg-shell-shutter-out");
        shell.classList.remove("wg-shell-desktop-flat");
        if (enterIn && shell.classList.contains("wg-shell-enter")) {
          requestAnimationFrame(() => {
            shell.classList.remove("wg-shell-enter");
          });
          return { waitMs: 520 };
        }
        shell.classList.remove("wg-shell-enter");
        return { waitMs: 0 };
      },
      {
        tw: target.width,
        th: target.height,
        sw: stage.width,
        sh: stage.height,
        clear,
        shutterOut,
        enterIn,
        desktopFlat,
      },
    )
    .catch(() => ({ waitMs: 0 }));
  const waitMs = result && result.waitMs ? Number(result.waitMs) : 0;
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
}

/**
 * Apply authored device fixture to the live page (0.13+).
 * Seamless viewport lerp + centered window + toast on set/clear.
 * With --video: keep recordVideo stage size and center a device shell in-frame.
 */
async function applyDeviceToPage(page, device, sync) {
  const mode = sync || (device ? "set" : "keep");
  if (mode === "keep" && !device) return;
  const d =
    device ||
    resolveDeviceState("desktop", false) || {
      preset: "desktop",
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      isMobile: false,
      hasTouch: false,
      touchMode: false,
    };
  const realSet =
    typeof page.__wgRealSetViewportSize === "function"
      ? page.__wgRealSetViewportSize
      : page.setViewportSize.bind(page);
  const target = {
    width: Math.max(200, Math.floor(d.viewport.width)),
    height: Math.max(200, Math.floor(d.viewport.height)),
  };
  const videoStage =
    page.__wgVideoViewport &&
    page.__wgVideoViewport.width > 0 &&
    page.__wgVideoViewport.height > 0
      ? {
          width: Math.floor(page.__wgVideoViewport.width),
          height: Math.floor(page.__wgVideoViewport.height),
        }
      : null;
  let from = null;
  try {
    from = page.viewportSize();
  } catch {
    from = null;
  }
  const announce = mode === "set" || mode === "clear";
  const toDesktop =
    mode === "clear" || (d.preset === "desktop" && !d.touchMode);
  const shouldAnimate =
    announce &&
    from &&
    from.width > 0 &&
    from.height > 0 &&
    (from.width !== target.width || from.height !== target.height);

  // Always clear camera zoom when returning to desktop (video + headed).
  if (toDesktop) {
    page.__wgDesktopFlat = true;
    await page
      .evaluate(() => {
        window.__wgZoomOutOnHide = true;
        if (window.__wgClearZoom) window.__wgClearZoom();
      })
      .catch(() => {});
  } else if (announce) {
    page.__wgDesktopFlat = false;
  }

  // Swipe trail is for scrolling (see ensureLocatorInView), not device morph.
  const nextOrient =
    d.orientation === "landscape" || d.orientation === "portrait"
      ? d.orientation
      : target.height > target.width
        ? "portrait"
        : "landscape";
  page.__wgDeviceOrient = nextOrient;
  page.__wgDevicePreset = toDesktop ? "desktop" : d.preset || "";

  if (videoStage) {
    // Lock Playwright viewport to the recordVideo size so frames fill the
    // .webm; center the device shell inside (OS window centering alone does not).
    // Do NOT fitWindow to the device size - that shrinks the viewport below the
    // recordVideo canvas and Playwright pads the .webm with grey (top-left bias).
    try {
      await realSet(videoStage);
    } catch {
      /* ignore */
    }
    const shellFrom = page.__wgDeviceShell || target;
    if (toDesktop) {
      // Zoom already cleared above. Full-bleed desktop shell (no matte frame).
      // Shutter-out: soft rounded -> radius 0, then flat edge-to-edge.
      const desk = {
        width: videoStage.width,
        height: videoStage.height,
      };
      page.__wgDeviceShell = { ...desk };
      await applyVideoDeviceStage(page, desk, videoStage, {
        clear: false,
        shutterOut: true,
        desktopFlat: true,
      });
      try {
        await realSet(videoStage);
      } catch {
        /* ignore */
      }
    } else {
      // Lerp shell size when switching mobile <-> tablet mid-video.
      const firstDevice = !page.__wgDeviceShell;
      if (
        announce &&
        shellFrom &&
        (shellFrom.width !== target.width || shellFrom.height !== target.height)
      ) {
        const steps = 14;
        const ms = Number(process.env.WAYGRAPH_DEVICE_TRANSITION_MS || 520);
        const stepMs = Math.max(12, Math.floor(ms / steps));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const e = t * t * (3 - 2 * t);
          const mid = {
            width: Math.round(shellFrom.width + (target.width - shellFrom.width) * e),
            height: Math.round(shellFrom.height + (target.height - shellFrom.height) * e),
          };
          await applyVideoDeviceStage(page, mid, videoStage, {
            clear: false,
            enterIn: i === 1 && firstDevice,
          });
          if (i < steps) await new Promise((r) => setTimeout(r, stepMs));
        }
      } else {
        await applyVideoDeviceStage(page, target, videoStage, {
          clear: false,
          enterIn: firstDevice || announce,
        });
      }
      page.__wgDeviceShell = { ...target };
      // Re-assert stage size after any prior non-video fitWindow.
      try {
        await realSet(videoStage);
      } catch {
        /* ignore */
      }
    }
  } else {
    // Unmaximize + center early so the lerp does not sit in the corner of a
    // maximized frame. Desktop clear maximizes at the end instead.
    if (!toDesktop) {
      await fitWindowToDeviceViewport(page, from && from.width ? from : target, {
        maximize: false,
      });
    }

    try {
      if (shouldAnimate) {
        const steps = 14;
        const ms = Number(process.env.WAYGRAPH_DEVICE_TRANSITION_MS || 520);
        const stepMs = Math.max(12, Math.floor(ms / steps));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const e = t * t * (3 - 2 * t); // smoothstep
          const mid = {
            width: Math.round(from.width + (target.width - from.width) * e),
            height: Math.round(from.height + (target.height - from.height) * e),
          };
          await realSet(mid);
          if (!toDesktop && (i === 1 || i === steps || i % 3 === 0)) {
            await fitWindowToDeviceViewport(page, mid, { maximize: false });
          }
          if (i < steps) await new Promise((r) => setTimeout(r, stepMs));
        }
      } else {
        await realSet(target);
      }
    } catch {
      /* maximized / null viewport hosts may reject - toast still updates */
    }

    if (toDesktop) {
      await fitWindowToDeviceViewport(page, target, { maximize: true });
    } else {
      await fitWindowToDeviceViewport(page, target, { maximize: false });
    }
  }

  // Fire toast near the end of the lerp so it reads as one seamless beat.
  await page
    .evaluate(
      (payload) => {
        if (window.__wgSyncDevice) window.__wgSyncDevice(payload);
      },
      {
        sync: mode,
        device: d,
        remain: mode === "keep" || mode === "set",
        announce,
      },
    )
    .catch(() => {});
}

/**
 * True if the engine's own narrate() (waygraph's public export, for a Block
 * author explicitly captioning one action) JUST positioned the ring for
 * THIS action, moments ago - the automatic per-fill/per-click narration
 * below should not immediately overwrite an author's own explicit caption
 * with its generic guess.
 */
async function wasJustNarrated(page) {
  return page
    .evaluate(() => {
      const w = window;
      return typeof w.__wgLastNarrate === "number" && Date.now() - w.__wgLastNarrate < 500;
    })
    .catch(() => false);
}

function instrumentInteractionHighlighting(page, mem, slowMo, pacing, stubBeforeRef, todoDockRef, deviceRef) {
  // Playwright's own slowMo ALREADY pauses after every single low-level
  // action it dispatches - and pressSequentially() fires one such action
  // PER CHARACTER. Also giving pressSequentially its own fixed delay
  // double-paces every keystroke (45ms + slowMo's own ~350ms, per
  // character) - an ordinary 22-character email alone stretched past 8
  // seconds. When slowMo is already doing the pacing, add none of our own;
  // only fall back to a small typing delay when slowMo is off entirely.
  //
  // pacing.skipTheater (WAYGRAPH_FAST_BLOCKS **or** FFCompose): near-zero
  // cursor / pop / typing - blitz this step. --fast alone sets gatesFast only
  // (shorter Next/autoplay gates) and must NOT skip theater, or the whole demo
  // looks like plain waygraph run.
  const skipTheater = () => !!pacing.skipTheater;
  const typeDelay = () => (skipTheater() ? 0 : slowMo ? 0 : 30);
  // Click is a single action, not per-character, so it doesn't compound
  // the same way - but slowMo still adds its own pause around the actual
  // click, so trim our own explicit "pop" pauses when it's already active
  // rather than stacking a full 1.2s on top of that.
  const clickPrePop = () => (skipTheater() ? 0 : slowMo ? 300 : 700);
  const clickPostPop = () => (skipTheater() ? 0 : slowMo ? 200 : 500);
  // FF / FAST_BLOCKS: no cursor travel animation (0). Plain theater keeps full.
  const cursorMs = (full) => (skipTheater() ? 0 : full);
  // Locator.fill()/click() only ever see a raw call, no context of where
  // the value came from. Patching mem.get() to remember the most recently
  // read key's name (Blocks read-then-immediately-fill, e.g. const { email
  // } = mem.get(LoginInput.key); ...fill(email)) lets the fill patch below
  // label the ring with the real key, not a generic "writing from mem".
  // Patches this ONE mem instance only, not MemPage's shared prototype -
  // there's exactly one mem per chain run.
  const memTrack = { lastKeyName: null, at: 0 };
  const originalGet = mem.get.bind(mem);
  mem.get = (key) => {
    memTrack.lastKeyName = key && key.name;
    memTrack.at = Date.now();
    return originalGet(key);
  };

  const proto = Object.getPrototypeOf(page.locator("html"));

  if (!proto.__wgFillPatched) {
    proto.__wgFillPatched = true;
    const originalFill = proto.fill;
    proto.fill = async function (value, options) {
      try {
        await installOverlay(page);
        await this.waitFor({
          state: "visible",
          timeout: (options && options.timeout) || 30000,
        }).catch(() => {});
        // Smooth scroll before measuring - otherwise off-screen fields
        // teleport when Playwright's fill actionability scrolls.
        await ensureLocatorInView(this, { instant: skipTheater() });
        const box = await this.boundingBox();
        let typeLabel = "input";
        try {
          const meta = await this.evaluate((el) => {
            const id = (el.id || "").toLowerCase();
            const name = (el.getAttribute("name") || "").toLowerCase();
            const ph = (el.getAttribute("placeholder") || "").toLowerCase();
            const ty = (el.getAttribute("type") || "text").toLowerCase();
            if (ty === "password" || /pass/.test(id + name + ph)) return "password";
            if (/user|email|login/.test(id + name + ph)) return "username";
            if (ty && ty !== "text") return ty;
            return id || name || ph || "input";
          });
          if (meta) typeLabel = String(meta);
        } catch {
          /* ignore */
        }
        if (box && !(await wasJustNarrated(page))) {
          // Only trust the "last mem.get()" as THIS fill's source if it
          // happened recently - a stale read from several actions ago is
          // more likely unrelated than actually describing this field.
          const fallback = memTrack.lastKeyName && Date.now() - memTrack.at < 3000
            ? "from mem: " + memTrack.lastKeyName
            : "writing from mem";
          const stubs = (stubBeforeRef && stubBeforeRef.current) || [];
          const cap = await captionForLocator(page, this, stubs, fallback);
          const stubIdx = await matchStubIndexForLocator(page, this, stubs);
          const stub = stubIdx >= 0 ? stubs[stubIdx] : null;
          await syncTodoDockAdvance(page, todoDockRef, stubIdx, stub);
          await moveCursorTo(page, box, cursorMs(500));
          if (stub) {
            await applyHighlightZoom(page, stub.selector, stub.zoom, stub.zoomOut);
          }
          demoHighlight(
            {
              selector: stub && stub.selector,
              label: cap.label,
              tone: cap.tone || (stub && stub.tone) || "planned",
              color: stub && stub.color,
              focus: !!(stub && stub.focus),
              zoom: stub && stub.zoom,
              zoomOut: stub && stub.zoomOut,
              gesture: stub && stub.gesture,
              weight: cap.weight,
              size: cap.size,
            },
            "fill",
          );
          await showRing(page, box, cap.label, cap.tone, {
            size: cap.size,
            weight: cap.weight,
            selector: stub && stub.selector ? stub.selector : undefined,
            focus: !!(stub && stub.focus),
          });
          await dwellMatchedStub(page, this, stubs, pacing);
          await new Promise((res) => setTimeout(res, skipTheater() ? 0 : 200));
          if (cap && cap.label) typeLabel = String(cap.label).slice(0, 40);
        } else if (box) {
          // Ring/caption already handled by narrate() - still move the
          // cursor there, just skip re-showing the ring with a generic label.
          await moveCursorTo(page, box, cursorMs(200));
        }
        await page
          .evaluate((label) => {
            if (window.__wgSetTypingBadge) window.__wgSetTypingBadge(true, label);
          }, typeLabel)
          .catch(() => {});
      } catch {
        // best-effort - element not visible/attached yet is not this
        // instrumentation's problem, the real fill below still runs
      }
      let result;
      try {
        // NOT this.clear() - Locator.clear() is itself implemented as
        // fill(""), and since fill is patched on the shared prototype,
        // that call would resolve back to THIS same patched function and
        // recurse forever. Call the real original fill directly instead.
        await originalFill.call(this, "", { timeout: options && options.timeout });
        result = await this.pressSequentially(String(value), { delay: typeDelay(), timeout: options && options.timeout });
      } catch {
        // pressSequentially unsupported on this element (e.g. a
        // contenteditable div, or a locator .fill() genuinely needs to
        // handle specially) - fall back to the real, unpatched fill.
        result = await originalFill.call(this, value, options);
      }
      await page
        .evaluate(() => {
          if (window.__wgSetTypingBadge) window.__wgSetTypingBadge(false);
        })
        .catch(() => {});
      // Fade the ring back out once this field is actually done, instead
      // of leaving it lit until the next Block's own before-panel clears
      // it - it was sticking around through the whole rest of the step.
      await hideRing(page);
      await restoreTheaterAfterNavigation(page, todoDockRef, deviceRef, stubBeforeRef);
      return result;
    };
  }

  if (!proto.__wgClickPatched) {
    proto.__wgClickPatched = true;
    const originalClick = proto.click;
    proto.click = async function (options) {
      let clickPoint = null;
      let clickTone = "auto";
      try {
        await installOverlay(page);
        // Wait until the target is visible BEFORE measuring - otherwise
        // defineNavBlock({ click }) (and any slow-to-appear control) skips
        // the cursor entirely: boundingBox was null, then originalClick
        // waited and clicked with no demo animation.
        await this.waitFor({
          state: "visible",
          timeout: (options && options.timeout) || 30000,
        }).catch(() => {});
        // Smooth-scroll off-screen targets before cursor/ring. Playwright's
        // own click scroll is instant and reads as a teleport under --fast.
        await ensureLocatorInView(this, { instant: skipTheater() });
        const box = await this.boundingBox();
        const narrated = box ? await wasJustNarrated(page) : false;
        if (box && !narrated) {
          let fallback = "click";
          try {
            const text = (await this.textContent())?.trim();
            if (text && text.length > 0 && text.length <= 30) fallback = text;
          } catch {
            // element has no simple text (an icon button, say) - generic label is fine
          }
          // Prefer "nav: …" when this locator is a NavBlock click target
          // (set on page by runStepMode just before act).
          try {
            const navLabel = await page.evaluate(() => window.__wgPendingNavClickLabel || null);
            if (navLabel) fallback = String(navLabel);
          } catch {
            /* ignore */
          }
          const stubs = (stubBeforeRef && stubBeforeRef.current) || [];
          const cap = await captionForLocator(page, this, stubs, fallback);
          const stubIdx = await matchStubIndexForLocator(page, this, stubs);
          const stub = stubIdx >= 0 ? stubs[stubIdx] : null;
          await syncTodoDockAdvance(page, todoDockRef, stubIdx, stub);
          clickTone = cap.tone;
          clickPoint = await moveCursorTo(page, box, cursorMs(600));
          if (stub) {
            await applyHighlightZoom(page, stub.selector, stub.zoom, stub.zoomOut);
          }
          demoHighlight(
            {
              selector: stub && stub.selector,
              label: cap.label,
              tone: cap.tone || (stub && stub.tone) || "planned",
              color: stub && stub.color,
              focus: !!(stub && stub.focus),
              zoom: stub && stub.zoom,
              zoomOut: stub && stub.zoomOut,
              gesture: stub && stub.gesture,
              weight: cap.weight,
              size: cap.size,
            },
            "click",
          );
          await showRing(page, box, cap.label, cap.tone, {
            size: cap.size,
            weight: cap.weight,
            selector: stub && stub.selector ? stub.selector : undefined,
            focus: !!(stub && stub.focus),
          });
          await dwellMatchedStub(page, this, stubs, pacing);
          // "pop for a few seconds" - Dan's own phrase, matching the
          // zsign demo-engine's ring-before-click pattern in
          // services/help-center-clip-engine's video-pipeline.
          await new Promise((res) => setTimeout(res, clickPrePop()));
        } else if (box) {
          // Ring/caption already handled by narrate() - still move the
          // cursor + pulse the click point, just skip re-showing the ring.
          clickPoint = await moveCursorTo(page, box, cursorMs(200));
          clickTone = "planned";
        }
      } catch {
        // best-effort - the real click below still runs either way
      }
      if (clickPoint) {
        await clickPulseAt(page, clickPoint.x, clickPoint.y, clickTone);
        // clickPulseAt only triggers the CSS animation class - it doesn't
        // wait for it. Without a pause here, the real click (and any
        // resulting navigation/DOM change) fires while the ripple is still
        // mid-animation, sometimes cutting it off before it's even visible.
        // Wait out the same .5s the "@keyframes wg-pulse" rule uses, so the
        // mock click visually completes before the real one fires.
        await new Promise((res) => setTimeout(res, skipTheater() ? 0 : 500));
      }
      // Touch theater (0.13+): prefer Locator.tap / long-press when device
      // touchMode is on (context launched with hasTouch). gesture on stub
      // wins: tap | hold | click.
      let result;
      const stubsForGesture = (stubBeforeRef && stubBeforeRef.current) || [];
      let gesture = "click";
      try {
        const idx = await matchStubIndexForLocator(page, this, stubsForGesture);
        const stub = idx >= 0 ? stubsForGesture[idx] : null;
        if (stub && stub.gesture) gesture = stub.gesture;
        else if (deviceRef && deviceRef.current && deviceRef.current.touchMode) gesture = "tap";
      } catch {
        if (deviceRef && deviceRef.current && deviceRef.current.touchMode) gesture = "tap";
      }
      if (gesture === "tap" || gesture === "hold") {
        try {
          if (gesture === "hold") {
            result = await this.tap({
              ...(options || {}),
              delay: skipTheater() ? 0 : 600,
            });
          } else {
            result = await this.tap(options);
          }
        } catch {
          result = await originalClick.call(this, options);
        }
      } else {
        result = await originalClick.call(this, options);
      }
      await new Promise((res) => setTimeout(res, clickPostPop()));
      await hideRing(page);
      // Full document navigation drops #wg-todo-dock + rings; restore carry.
      await restoreTheaterAfterNavigation(page, todoDockRef, deviceRef, stubBeforeRef);
      return result;
    };
  }

  // Caps any Locator.waitFor()/page.waitForTimeout() timeout during step
  // mode - a Block polling for something that will NEVER happen (e.g. "is
  // there an unverified-account banner" on an account that IS verified)
  // has no choice but to wait out its own hardcoded timeout in full before
  // concluding "no". Only the WAIT gets capped, never the real outcome -
  // if the thing genuinely appears at 800ms into a 5000ms wait, waitFor
  // still resolves at 800ms same as always; this only shortens the "it's
  // just never going to happen" case. Plain setTimeout()-based sleep()
  // helpers some Blocks use for their own pacing are NOT Playwright calls
  // at all and can't be touched this way - a real, disclosed limit, not
  // silently ignored.
  // Pushed down to 700ms earlier this session based on login.block.ts
  // alone - every waitFor() there is a "give up gracefully" pattern
  // (wrapped in .catch()/Promise.race, a timeout IS the expected negative
  // result). That's a different kind of wait than a REQUIRED
  // synchronization point with no catch - e.g. overview-metrics.block.ts
  // waits (uncaught) for a "Loading pending actions..." placeholder to
  // actually appear before it's safe to check for an error, a real
  // hydration signal the block's own comment calls "deterministic,"
  // not a probe. A flat 700ms cap broke that block outright on this
  // shared, loaded box (a real 3-block chain run threw instead of
  // catching). Bumping the SAME flat cap to 4000ms to cover it just
  // reintroduced most of the original torture on login.block.ts's own
  // 5000ms unverified-email check - 4000ms is barely better than the real
  // 5000ms it's capping.
  //
  // A single flat number can't serve both: it has no way to tell "safe to
  // cut short" from "must actually happen" apart from the outside. But
  // each call site's OWN declared timeout is already a real signal of
  // which kind it is - a Block author who wrote timeout: 5000 for a quick
  // conditional check and one who wrote timeout: 15000 for a real
  // hydration wait weren't picking the same number by accident. Scale the
  // cap off that instead of a single constant: 30% of whatever was
  // declared, never below a 700ms floor (the value already proven safe
  // for the fast/common case), and never above what was declared in the
  // first place. login's 5000ms check -> 1500ms (still 3.5s faster than
  // uncapped). overview-metrics' 15000ms wait -> 4500ms (more headroom
  // than the flat 4000ms fix, not less).
  const WAIT_CAP_FLOOR_MS = 700;
  const WAIT_CAP_FRACTION = 0.3;
  const scaledWaitCap = (declared) => Math.max(WAIT_CAP_FLOOR_MS, declared * WAIT_CAP_FRACTION);
  if (!proto.__wgWaitForPatched) {
    proto.__wgWaitForPatched = true;
    const originalWaitFor = proto.waitFor;
    proto.waitFor = function (options) {
      const declared = (options && options.timeout) || 30000;
      const capped = { ...(options || {}), timeout: Math.min(declared, scaledWaitCap(declared)) };
      return originalWaitFor.call(this, capped);
    };
  }
  const pageProto = Object.getPrototypeOf(page);
  if (!pageProto.__wgWaitForTimeoutPatched) {
    pageProto.__wgWaitForTimeoutPatched = true;
    const originalWaitForTimeout = pageProto.waitForTimeout;
    pageProto.waitForTimeout = function (ms) {
      // A plain sleep (not a "wait for condition X") never has a hidden
      // "must actually happen" requirement attached - always safe to cut
      // to the floor, no scaling needed.
      return originalWaitForTimeout.call(this, Math.min(ms, WAIT_CAP_FLOOR_MS));
    };
  }
}

/**
 * Clears cookies + storage and re-navigates to a known-fresh page. Shared by
 * the per-block session-reset check below and by the error panel's own
 * "Retry Episode" button - a retry needs the exact same clean slate a normal
 * episode boundary gets, not just re-running the failed block against
 * whatever broken/half-navigated state it left the page in.
 */
async function resetPageState(context, page, baseURL) {
  await context.clearCookies().catch(() => {});
  await page
    .evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* storage blocked (e.g. about:blank) - nothing to clear anyway */
      }
    })
    .catch(() => {});
  await page.goto(baseURL || "about:blank").catch(() => {});
}

async function runStepMode(engine, start, end, context, page, mem, resolved, slowMo, title, fastBlockNames, clearSession, baseURL) {
  // A shared, mutable pacing knob the interaction patches read live (per
  // call, not once at setup) - flipped per-block below so one block (e.g.
  // WAYGRAPH_FAST_BLOCKS=login or an FFCompose unit) can run through with
  // none of the overlay's own added dwell while the rest of the chain keeps
  // the full theatrical pace.
  // --fast / WAYGRAPH_DEMO_FAST: shorter auto-next / Next gates ONLY -
  // keeps smooth cursor travel (not akin to waygraph run).
  // FFCompose + WAYGRAPH_FAST_BLOCKS: skipTheater (blitz overlay delays).
  // When the flow has any opaque FF unit and WAYGRAPH_SLOWMO is unset,
  // launch slowMo is 0 so Playwright itself does not re-tax every click
  // inside the FF (that was the "30s login / cursor gone but still slow" bug).
  const demoFast = process.env.WAYGRAPH_DEMO_FAST === "1";
  const stepperMode = process.env.WAYGRAPH_STEPPER === "full" ? "full" : "carousel";
  const pacing = { gatesFast: demoFast, gatesSlow: false, skipTheater: false, demoPace: "normal" };
  const stubBeforeRef = { current: [] };
  /** Live todo dock for Method fill/click advance (same carry as lastTodoDock). */
  const todoDockRef = { current: undefined };
  /** Live device fixture for touch theater (same carry as lastDevice). */
  const deviceRef = { current: undefined };
  instrumentInteractionHighlighting(page, mem, slowMo, pacing, stubBeforeRef, todoDockRef, deviceRef);
  // Force the panel checkbox from this process's flags/env at run start.
  // installOverlay only seeds localStorage when the key is null (so mid-run
  // checkbox clicks survive navigations). Without this, a prior --autoplay
  // session sticks forever and agents cannot flip back with --no-autoplay.
  // Must run on the *demo origin* (after goto), not about:blank - localStorage
  // is origin-scoped.
  const syncAutoplayFromEnv = async () => {
    if (process.env.WAYGRAPH_AUTOPLAY === undefined) return;
    const on = process.env.WAYGRAPH_AUTOPLAY === "1";
    await page
      .evaluate((want) => {
        try {
          localStorage.setItem("wg-autoplay", want ? "1" : "0");
        } catch {
          /* private mode / blocked storage */
        }
      }, on)
      .catch(() => {});
  };
  await syncAutoplayFromEnv();
  // Some real Blocks (e.g. zsign-all's login.block.ts) call
  // page.setViewportSize({ width: 1280, height: 720 }) inside their own
  // act() - a hardcoded override for THEIR OWN testing consistency, with no
  // idea an interactive human session is watching. Restoring the size
  // AFTER each step (the first attempt at this) was still just repairing
  // damage after the fact, on a delay, per-step - not the real fix. The
  // real fix is to stop the override from ever landing at all: no-op
  // setViewportSize entirely for the duration of step mode. Blocks that
  // call it don't need it to actually do anything here - their own
  // selectors/layouts still work fine at whatever size the real window
  // already is. Authored ctx.device() still uses __wgRealSetViewportSize.
  page.__wgRealSetViewportSize = page.setViewportSize.bind(page);
  page.setViewportSize = async () => {};
  let resolveNext = null;
  // Render-to-gate race: a slide/step panel's Next button is wired to
  // window.__wgNext BEFORE gate() calls waitForNext() (there is at least
  // one more await - the autoplay-sync evaluate - in between on the
  // presentSlides path). A click landing in that small window used to be
  // dropped silently (resolveNext was still null) - the panel then looked
  // "stuck" forever since gate() started listening AFTER the click already
  // fired and no second click ever came. Queue it instead: the very next
  // waitForNext() call picks up a pending click immediately.
  let pendingNext = null;
  await page.exposeFunction("__wgNext", (edits) => {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r(edits);
    } else {
      pendingNext = edits;
    }
  });
  const waitForNext = () =>
    new Promise((res) => {
      if (pendingNext !== null) {
        const edits = pendingNext;
        pendingNext = null;
        res(edits);
        return;
      }
      resolveNext = res;
    });
  // WAYGRAPH_AUTOPLAY=1 only sets the STARTING checkbox state now - the
  // panel's own "Auto-advance" checkbox can flip it live, mid-run, and a
  // manual click always wins over an in-flight autoplay wait regardless of
  // which way the checkbox is set. That's the hybrid Dan asked for: some
  // steps auto-advance, some get a manual click, toggled as the demo goes,
  // not fixed for the whole run from a single env var.
  const autoplayMs = process.env.WAYGRAPH_AUTOPLAY_MS
    ? Number(process.env.WAYGRAPH_AUTOPLAY_MS)
    : demoFast
      ? 450
      : 1800;
  const currentAutoplay = () =>
    page
      .evaluate(() => {
        try {
          return localStorage.getItem("wg-autoplay") === "1";
        } catch {
          return false;
        }
      })
      .catch(() => false);
  const gate = async () => {
    const next = waitForNext();
    // WAYGRAPH_FAST_BLOCKS names a block that should blow past its own
    // gates too, not just skip its interaction dwell - otherwise autoplay
    // still stalls the full autoplayMs admiring a step that intentionally
    // ran too fast to watch.
    const ms = demoPaceGateMs(
      pacing.skipTheater ? "blitz" : pacing.demoPace,
      autoplayMs,
    );
    let elapsed = 0;
    for (;;) {
      // Re-read the checkbox EVERY loop tick, not once up front - a human
      // starting a step in manual mode and then checking "Auto-advance"
      // mid-wait must actually start counting down from that moment, not
      // get stuck on whatever mode was live when gate() was first called.
      const auto = await currentAutoplay();
      const slice = auto
        ? Math.min(250, Math.max(50, ms - elapsed))
        : 250; // manual: just a cheap poll tick, waiting on either a click or the box getting checked
      const winner = await Promise.race([
        next.then((edits) => ({ clicked: true, edits })),
        new Promise((res) => setTimeout(() => res({ clicked: false }), slice)),
      ]);
      if (winner.clicked) return winner.edits;
      if (!auto) continue;
      elapsed += slice;
      if (elapsed >= ms) return {};
    }
  };
  const allNames = resolved.map((r) => r.block.name);
  const allDescriptions = resolved.map((r) => r.block.description || "");
  // Deduped, in-order list of every real episode this chain touches - for
  // the episode tab bar. Ad hoc block segments (no named Flow) carry no
  // episodeNumber and never appear here, same gate the "Episode N:"
  // heading already used.
  const allEpisodes = [];
  for (const r of resolved) {
    if (r.episodeNumber && !allEpisodes.some((e) => e.episodeNumber === r.episodeNumber)) {
      allEpisodes.push({ episodeNumber: r.episodeNumber, episodeTitle: r.episodeTitle });
    }
  }

  let result;
  /** Carry floating todo dock across steps (empty stubBefore must not wipe). */
  let lastTodoDock = undefined;
  /** Multi-todo: every dock keyed by todoId (or "_default"), survives navigation. */
  const todoDockById = new Map();
  const dockRegistryKey = (dock) =>
    dock && dock.id && String(dock.id).trim() ? String(dock.id).trim() : "_default";
  const rememberTodoDock = (dock, sync, parallel) => {
    if (sync === "clear") {
      todoDockById.clear();
      return;
    }
    if (sync === "set" && dock) {
      if (!parallel) todoDockById.clear();
      todoDockById.set(dockRegistryKey(dock), dock);
      return;
    }
    // keep: refresh / re-seed so syncAllTodoDocks never sees an empty map
    // while lastTodoDock still carries (nav wipe + mid-act advance).
    if (sync === "keep" && dock) {
      todoDockById.set(dockRegistryKey(dock), dock);
    }
  };
  const syncAllTodoDocks = async (opts) => {
    const docks = [...todoDockById.values()];
    const parallel = !!(opts && opts.parallel);
    if (!docks.length) {
      // Empty registry: do NOT clear the DOM. renderBefore/After may have
      // just painted from lastTodoDock (keep). Clearing here made todos
      // vanish until the next ctx.todos() set (PIA #15).
      return;
    }
    await page
      .evaluate(
        ({ list, parallel }) => {
          if (!window.__wgSyncTodos) return;
          for (let i = 0; i < list.length; i++) {
            const d = list[i];
            window.__wgSyncTodos({
              sync: "set",
              dock: d,
              todoId: (d && d.id) || null,
              pos: (d && d.pos) || null,
              // First dock replaces; later ones keep siblings when parallel.
              replace: !(parallel && i > 0),
              parallel: parallel && i > 0,
            });
          }
        },
        { list: docks, parallel },
      )
      .catch(() => {});
  };
  /** Carry device / touch fixture across steps (omit = keep, like todos). */
  let lastDevice = undefined;
  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i];
    // The block breadcrumb is scoped to THIS step's own episode, not the
    // whole chain - within episode 2, step 1 should read as "1st of 2,"
    // not "6th of 7." Falls back to the whole chain when this block has no
    // episode (an ad hoc chain with no named Flows), unchanged from before.
    const episodeBlockIndices = r.episodeNumber
      ? resolved.reduce((acc, x, idx) => {
          if (x.episodeNumber === r.episodeNumber) acc.push(idx);
          return acc;
        }, [])
      : resolved.map((_x, idx) => idx);
    const moduleNames = episodeBlockIndices.map((idx) => allNames[idx]);
    const moduleDescriptions = episodeBlockIndices.map((idx) => allDescriptions[idx]);
    const moduleIndex = episodeBlockIndices.indexOf(i);
    // Where a "Retry Episode" click (see the catch block below) rewinds to -
    // the current episode's own first block, or the whole chain's first
    // block when there's no real episode (episodeBlockIndices degrades to
    // the full resolved array in that case, so this is just 0).
    const episodeStartIndex = episodeBlockIndices[0];
    // True only on an episode's own first block - the one moment worth a
    // gentle "you're here now" signal, not every step inside it.
    const justEnteredEpisode = moduleIndex === 0 && r.episodeNumber !== undefined;
    // Seed THIS segment's own json payload now, not earlier - see the long
    // comment where seedMem closures are built, in main()'s resolution
    // loop. Must run before "keys" below reads mem.get() for the panel
    // display, and before this segment's own first block executes.
    if (r.seedMem) r.seedMem();
    // Reset session state before this block if EITHER: the blanket
    // WAYGRAPH_CLEAR_SESSION=1 override is set (a manual, always-on-after-
    // the-first-block stopgap for ad hoc block chains with no real Flow
    // object), OR this specific block is a Flow's own declared entry point
    // (defineFlow(...) wrapped in withSessionReset) reached via a
    // multi-flow chain spec - the proper, opt-in-per-Flow mechanism. Never
    // resets before the very first block - there's no prior state yet.
    //
    // Done HERE, before this step's own "before" panel is even shown - not
    // after the human clicks "Run this step" - so the panel for the new
    // episode appears over an already-fresh page, not the PREVIOUS
    // episode's stale final page (e.g. still showing /dashboard) with the
    // new episode's panel merely floating on top of it ("overlapping",
    // Dan's own word for this). The explicit re-navigate (not just
    // clearing cookies/storage) is what actually makes the page itself
    // look fresh again - clearing storage alone doesn't change what's
    // still rendered on screen.
    if ((clearSession || r.resetSession) && i > 0) {
      await resetPageState(context, page, baseURL);
      // clear() wiped origin storage - re-apply CLI autoplay default.
      await syncAutoplayFromEnv();
    }
    // Episode pace: block > flow > CLI --fast (only when no authored pace).
    // Authoring wins: withDemoPace("slow"|2|4500) keeps slow dwell even under --fast.
    const stepPace = resolveStepDemoPace({
      blockPace: r.block.demoPace,
      flowPace: r.demoPace,
      fastForward: !!r.block.fastForward,
      wasFastForward: !!r.wasFastForward,
    });
    const authoredPace =
      (r.block.demoPace != null && r.block.demoPace !== "") ||
      (r.demoPace != null && r.demoPace !== "");
    const cliFast = demoFast || fastBlockNames.has(r.block.name);
    pacing.demoPace =
      stepPace === "normal" && cliFast && !authoredPace
        ? fastBlockNames.has(r.block.name)
          ? "blitz"
          : "fast"
        : stepPace;
    pacing.gatesFast =
      demoPaceIsFast(pacing.demoPace) ||
      !!r.block.fastForward ||
      !!r.wasFastForward ||
      (!authoredPace && demoFast);
    pacing.gatesSlow = demoPaceIsSlow(pacing.demoPace);
    pacing.skipTheater =
      demoPaceIsBlitz(pacing.demoPace) ||
      fastBlockNames.has(r.block.name) ||
      !!r.block.fastForward ||
      !!r.wasFastForward;
    const fixtures = r.highlightFixtures;
    const flowStyle = r.highlightStyle;
    const stubBeforePhase = await runStubPhase(r.block, "stubBefore", { fixtures, mem });
    stubBeforeRef.current = stubBeforePhase.highlights.map((h) =>
      applyHighlightStyleDefaults(h, flowStyle),
    );
    logStubPhaseFixtures("before", {
      ...stubBeforePhase,
      highlights: stubBeforeRef.current.map((h) => ({
        ...h,
        label: formatHighlightCaption(h),
      })),
    });
    const appliedBefore = applyTodoPhase(lastTodoDock, {
      todoSync: stubBeforePhase.todoSync,
      todoDock: stubBeforePhase.todoDock,
      todos: stubBeforePhase.todos,
      todoPos: stubBeforePhase.todoPos,
    });
    lastTodoDock = appliedBefore.dock;
    todoDockRef.current = lastTodoDock;
    rememberTodoDock(appliedBefore.dock, appliedBefore.sync, !!stubBeforePhase.todoParallel);
    const appliedDeviceBefore = applyDevicePhase(lastDevice, {
      deviceSync: stubBeforePhase.deviceSync,
      device: stubBeforePhase.device,
    });
    lastDevice = appliedDeviceBefore.device;
    deviceRef.current = lastDevice;
    if (appliedDeviceBefore.sync !== "keep" || lastDevice) {
      await applyDeviceToPage(page, lastDevice, appliedDeviceBefore.sync);
    }
    const stubBeforeTodos =
      (lastTodoDock && lastTodoDock.groups[0] && lastTodoDock.groups[0].items) ||
      stubBeforePhase.todos ||
      [];
    const overlayTitle =
      (stubBeforePhase.title && String(stubBeforePhase.title).trim()) ||
      (r.episodeTitle && String(r.episodeTitle).trim()) ||
      title ||
      "waygraph demo";
    const overlayTodoPos =
      (lastTodoDock && lastTodoDock.pos) || stubBeforePhase.todoPos || undefined;
    const isNavBlock = r.block.__waygraphKind === "nav";
    const autoNow = await currentAutoplay();
    // Video / --mini: compact pill. Never pass false - Hide/localStorage wins.
    const forceCollapsed =
      !!process.env.WAYGRAPH_VIDEO ||
      process.env.WAYGRAPH_MINI === "1" ||
      process.env.WAYGRAPH_STEPPER_MINI === "1"
        ? true
        : undefined;
    const requires = r.block.requires ?? [];
    const keys = requires.map((k) => {
      let value = "<not yet set>";
      try {
        value = JSON.stringify(mem.get(k));
      } catch {
        // not written yet - shown as a placeholder, not a crash
      }
      return { name: k.name, value };
    });
    const paceSpeak = paceSpeakFields(pacing.demoPace, autoplayMs);
    if (process.env.WAYGRAPH_JSON !== "1") {
      demoLog(
        "step " +
          (i + 1) +
          "/" +
          resolved.length +
          " " +
          r.block.name +
          " · " +
          paceSpeak.paceLabel +
          (r.episodeNumber ? " · episode " + r.episodeNumber : ""),
      );
      demoLog(
        "  gate~" +
          autoplayMs +
          "ms skipTheater=" +
          !!pacing.skipTheater +
          " gatesFast=" +
          !!pacing.gatesFast,
      );
      demoLog("  " + summarizeDevice(lastDevice));
      const phaseZoom =
        stubBeforePhase.zoom != null && Number(stubBeforePhase.zoom) > 0
          ? Number(stubBeforePhase.zoom)
          : null;
      const phaseZoomOut =
        stubBeforePhase.zoomOut !== undefined ? !!stubBeforePhase.zoomOut : null;
      demoLog(
        "  zoom=" +
          (phaseZoom != null ? phaseZoom + "x" : "default") +
          (phaseZoomOut != null ? " zoomOut=" + phaseZoomOut : "") +
          " (StubCtx / API; live chip top-left when ring zoom >1)",
      );
      logTodoDockFull(lastTodoDock, "  before");
      demoLog("  todoSync=" + appliedBefore.sync);
    }
    await renderBeforeStep(page, {
      index: i,
      total: resolved.length,
      blockName: r.block.name,
      description: r.block.description || "",
      keys,
      allNames: moduleNames,
      allDescriptions: moduleDescriptions,
      moduleIndex,
      allEpisodes,
      justEnteredEpisode,
      title: overlayTitle,
      todoPos: overlayTodoPos,
      episodeNumber: r.episodeNumber,
      episodeTitle: r.episodeTitle,
      stepperMode,
      forceCollapsed,
      todos: stubBeforeTodos,
      todoDock: lastTodoDock,
      todoSync: appliedBefore.sync,
      todoId: lastTodoDock && lastTodoDock.id,
      ...paceSpeak,
    });
    // Re-paint dock(s) - renderBeforeStep syncs the active one; this enforces replace.
    await syncAllTodoDocks({ parallel: !!stubBeforePhase.todoParallel });
    if (process.env.WAYGRAPH_JSON !== "1") {
      const docks = await probeTodoDocksOnPage(page);
      if (!docks.length && lastTodoDock) {
        demoLog("  WARN todos authored but dock-dom empty (not painted?)");
      } else if (docks.length) {
        demoLog(
          "  dock-dom " +
            docks
              .map(
                (d) =>
                  d.key +
                  "@" +
                  d.pos +
                  " " +
                  d.left +
                  "," +
                  d.top +
                  " " +
                  d.w +
                  "x" +
                  d.h +
                  (d.onScreen ? "" : " OFFSCREEN") +
                  " n=" +
                  d.n +
                  (d.current ? ' cur="' + d.current + '"' : ""),
              )
              .join(" | "),
        );
      }
    }
    const edits = await gate();
    for (const k of requires) {
      if (edits[k.name] !== undefined) {
        try {
          mem.set(k, JSON.parse(edits[k.name]));
        } catch {
          // left as-authored if the human's edit isn't valid JSON
        }
      }
    }
    const recordingVideo = !!process.env.WAYGRAPH_VIDEO;
    await markStepRunning(page, {});
    // NavBlock click-nav: label the upcoming Locator.click demo cursor as
    // "nav: <block>" so pia/demo watchers see cursor+pulse on click nav
    // (not only on regular Block clicks).
    const navClick = r.block.__waygraphNavClick;
    if (r.block.__waygraphKind === "nav" && navClick !== undefined) {
      await page
        .evaluate((label) => {
          window.__wgPendingNavClickLabel = label;
        }, "nav: " + (r.block.name || "click"))
        .catch(() => {});
    } else {
      await page
        .evaluate(() => {
          delete window.__wgPendingNavClickLabel;
        })
        .catch(() => {});
    }
    const stepFlow = engine.defineFlow([start, r.block, end]);
    // { closeOnFinish: false } makes Flow.run return { result, page }, not
    // the plain checkpoint - destructure it, don't treat the wrapper as the
    // checkpoint itself (caught via the standalone verify script: this used
    // to serialize the whole { result, page } object into the panel/log).
    let stepOutcome;
    try {
      stepOutcome = await stepFlow.run(context, mem, { page, closeOnFinish: false });
    } catch (err) {
      await page
        .evaluate(() => {
          delete window.__wgPendingNavClickLabel;
        })
        .catch(() => {});
      // stubOnError + error/expected panel BEFORE acknowledging (PIA RFC).
      const errEdits = await presentFailPanel(page, {
        block: r.block,
        fixtures: r.highlightFixtures,
        highlightStyle: r.highlightStyle,
        error: err,
        index: i,
        total: resolved.length,
        blockName: r.block.name,
        message: err && err.message ? err.message : String(err),
        allNames: moduleNames,
        allDescriptions: moduleDescriptions,
        moduleIndex,
        allEpisodes,
        title,
        episodeNumber: r.episodeNumber,
        episodeTitle: r.episodeTitle,
        expectedFailureReason: r.expectedFailureReason,
        stepperMode,
        gatesFast: pacing.gatesFast,
        demoPace: pacing.demoPace,
        gate,
        mem,
      });
      if (errEdits && errEdits.__wgRetry) {
        await resetPageState(context, page, baseURL);
        await syncAutoplayFromEnv();
        i = episodeStartIndex - 1;
        continue;
      }
      // withExpectedFailure episode (e.g. locked_out_user) - throwing here is
      // the demo working, not a broken run.
      if (r.expectedFailureReason) {
        if (process.env.WAYGRAPH_JSON !== "1") {
          console.log(
            "waygraph: expected failure on " + r.block.name + " - " + r.expectedFailureReason,
          );
        }
        break;
      }
      throw err;
    }
    await page
      .evaluate(() => {
        delete window.__wgPendingNavClickLabel;
      })
      .catch(() => {});
    result = stepOutcome.result;
    // Mid-act Method fill/click advances live on todoDockRef - fold that
    // back into lastTodoDock before stubAfter / next-block keep, or the
    // next step reverts to the pre-act (blank / index-0) checklist.
    if (todoDockRef.current) lastTodoDock = todoDockRef.current;
    // withExpectedFailure last block that SUCCEEDS on the intentional fail
    // branch (e.g. submit-login -> LoginPage + error banner). Still show
    // stubOnError rings + amber "expected outcome" panel - branching no
    // longer throws, but the demo must not skip the educational overlay.
    if (r.expectedFailureReason) {
      const errEdits = await presentFailPanel(page, {
        block: r.block,
        fixtures: r.highlightFixtures,
        highlightStyle: r.highlightStyle,
        error: undefined,
        out: result,
        index: i,
        total: resolved.length,
        blockName: r.block.name,
        message:
          "Resolved " +
          (result && result.__state ? result.__state : JSON.stringify(result)) +
          " (expected failure path)",
        allNames: moduleNames,
        allDescriptions: moduleDescriptions,
        moduleIndex,
        allEpisodes,
        title,
        episodeNumber: r.episodeNumber,
        episodeTitle: r.episodeTitle,
        expectedFailureReason: r.expectedFailureReason,
        stepperMode,
        gatesFast: pacing.gatesFast,
        demoPace: pacing.demoPace,
        gate,
        mem,
      });
      if (errEdits && errEdits.__wgRetry) {
        await resetPageState(context, page, baseURL);
        await syncAutoplayFromEnv();
        i = episodeStartIndex - 1;
        continue;
      }
      if (process.env.WAYGRAPH_JSON !== "1") {
        console.log(
          "waygraph: expected failure on " + r.block.name + " - " + r.expectedFailureReason,
        );
      }
      break;
    }
    const fixturesAfter = r.highlightFixtures;
    const slides = resolveSlides(r.block, { out: result, fixtures: fixturesAfter }).map((s) =>
      applyHighlightStyleDefaults(s, r.highlightStyle),
    );
    if (slides.length > 0) {
      await presentSlides(page, slides, gate, {
        title,
        blockName: r.block.name,
        fast: pacing.gatesFast,
        pace: pacing.demoPace,
        episodeNumber: r.episodeNumber,
        episodeTitle: r.episodeTitle,
        autoplayMs,
      });
    }
    let highlights;
    let stubAfterTodos = [];
    let afterOverlayTitle = overlayTitle;
    let afterTodoPos = overlayTodoPos;
    let appliedAfter = { dock: lastTodoDock, sync: "keep" };
    let appliedDeviceAfter = { device: lastDevice, sync: "keep" };
    let afterTodoParallel = false;
    if (hasAuthoredStubAfter(r.block, result, fixturesAfter)) {
      const afterPhase = await runStubPhase(r.block, "stubAfter", {
        out: result,
        fixtures: fixturesAfter,
        mem,
      });
      logStubPhaseFixtures("after", {
        ...afterPhase,
        highlights: (afterPhase.highlights || []).map((h) => {
          const styled = applyHighlightStyleDefaults(h, r.highlightStyle);
          return { ...styled, label: formatHighlightCaption(styled) };
        }),
      });
      afterTodoParallel = !!afterPhase.todoParallel;
      appliedAfter = applyTodoPhase(lastTodoDock, {
        todoSync: afterPhase.todoSync,
        todoDock: afterPhase.todoDock,
        todos: afterPhase.todos,
        todoPos: afterPhase.todoPos,
      });
      lastTodoDock = appliedAfter.dock;
      todoDockRef.current = lastTodoDock;
      rememberTodoDock(appliedAfter.dock, appliedAfter.sync, afterTodoParallel);
      appliedDeviceAfter = applyDevicePhase(lastDevice, {
        deviceSync: afterPhase.deviceSync,
        device: afterPhase.device,
      });
      lastDevice = appliedDeviceAfter.device;
      deviceRef.current = lastDevice;
      if (appliedDeviceAfter.sync !== "keep" || (appliedDeviceAfter.sync === "set" && lastDevice)) {
        await applyDeviceToPage(page, lastDevice, appliedDeviceAfter.sync);
      }
      stubAfterTodos =
        (lastTodoDock && lastTodoDock.groups[0] && lastTodoDock.groups[0].items) ||
        afterPhase.todos ||
        [];
      if (afterPhase.title && String(afterPhase.title).trim()) {
        afterOverlayTitle = String(afterPhase.title).trim();
      }
      if (afterPhase.todoPos) afterTodoPos = afterPhase.todoPos;
      if (lastTodoDock && lastTodoDock.pos) afterTodoPos = lastTodoDock.pos;
      highlights = afterPhase.highlights.map((h) => {
        const styled = applyHighlightStyleDefaults(h, r.highlightStyle);
        return {
          selector: styled.selector,
          label: formatHighlightCaption(styled),
          duration: styled.duration,
          fastMode: styled.fastMode,
          tone: styled.tone,
          size: styled.size,
          weight: styled.weight,
          zoom: styled.zoom,
          zoomOut: styled.zoomOut,
          focus: !!styled.focus,
          tone: styled.tone,
          color: styled.color,
          detail: styled.detail,
        };
      });
    } else {
      highlights = extractVerifyHighlights(r.block, result.__state).map((h) =>
        applyHighlightStyleDefaults(h, r.highlightStyle),
      );
    }
    await renderAfterStep(page, {
      index: i,
      total: resolved.length,
      blockName: r.block.name,
      result,
      resultTag: JSON.stringify(result),
      highlights,
      gatesFast: pacing.gatesFast,
      pace: pacing.demoPace,
      ...paceSpeakFields(pacing.demoPace, autoplayMs),
      isLast: i === resolved.length - 1,
      allNames: moduleNames,
      allDescriptions: moduleDescriptions,
      moduleIndex,
      allEpisodes,
      title: afterOverlayTitle,
      todoPos: afterTodoPos,
      episodeNumber: r.episodeNumber,
      episodeTitle: r.episodeTitle,
      stepperMode,
      todos: stubAfterTodos,
      todoDock: lastTodoDock,
      todoSync: appliedAfter.sync,
      todoId: lastTodoDock && lastTodoDock.id,
      todoDockRef,
      forceCollapsed:
        !!process.env.WAYGRAPH_VIDEO ||
        process.env.WAYGRAPH_MINI === "1" ||
        process.env.WAYGRAPH_STEPPER_MINI === "1"
          ? true
          : undefined,
    });
    await syncAllTodoDocks({ parallel: afterTodoParallel });
    // Ring cycle / stubAfter may have advanced the dock - persist for next block.
    if (todoDockRef.current) {
      lastTodoDock = todoDockRef.current;
      rememberTodoDock(todoDockRef.current, "set", afterTodoParallel);
    }
    if (process.env.WAYGRAPH_JSON !== "1") {
      demoLog(
        "  after " +
          summarizeDevice(lastDevice) +
          " deviceSync=" +
          appliedDeviceAfter.sync,
      );
      logTodoDockFull(lastTodoDock, "  after");
      demoLog("  after todoSync=" + appliedAfter.sync);
      const docksAfter = await probeTodoDocksOnPage(page);
      if (!docksAfter.length && lastTodoDock && appliedAfter.sync !== "clear") {
        demoLog("  WARN after: todos authored but dock-dom empty");
      } else if (docksAfter.length) {
        demoLog(
          "  after dock-dom " +
            docksAfter
              .map(
                (d) =>
                  d.key +
                  "@" +
                  d.pos +
                  " " +
                  d.left +
                  "," +
                  d.top +
                  " " +
                  d.w +
                  "x" +
                  d.h +
                  (d.onScreen ? "" : " OFFSCREEN") +
                  " n=" +
                  d.n +
                  (d.current ? ' cur="' + d.current + '"' : ""),
              )
              .join(" | "),
        );
      } else if (appliedAfter.sync === "clear") {
        demoLog("  after dock-dom cleared (expected)");
      }
    }
    await gate();
  }
  await teardownOverlay(page);
  return result;
}

/**
 * "chain WAYGRAPH_JSON=1" - the unattended counterpart to "chain --step": no
 * human gate, no overlay, headless by default. The same execution --step
 * already has (session-reset boundaries, per-segment mem-seeding) but
 * reporting built for an agent reading stdout afterward, not a human
 * watching the browser live - a flat JSON object naming exactly which Block
 * failed, what every EARLIER Block resolved to, and a screenshot at the
 * exact moment of failure, since there's no live browser for a human to
 * glance at instead. (Previously its own "waygraph auto" verb - renamed once
 * "auto" came to mean the state-machine discovery tool instead; this is a
 * chain reporting mode, not a distinct command.)
 */
async function runJsonReportMode(engine, start, end, context, page, mem, resolved, baseURL) {
  const steps = [];
  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i];
    if (r.seedMem) r.seedMem();
    if (r.resetSession && i > 0) {
      await resetPageState(context, page, baseURL);
    }
    const startedAt = Date.now();
    const stepFlow = engine.defineFlow([start, r.block, end]);
    try {
      const outcome = await stepFlow.run(context, mem, { page, closeOnFinish: false });
      steps.push({ name: r.block.name, checkpoint: outcome.result, ms: Date.now() - startedAt });
    } catch (err) {
      if (r.expectedFailureReason) {
        steps.push({
          name: r.block.name,
          expectedFailure: true,
          error: err && err.message ? err.message : String(err),
          ms: Date.now() - startedAt,
        });
        return {
          ok: true,
          expectedFailure: true,
          failedAt: r.block.name,
          reason: r.expectedFailureReason,
          steps,
        };
      }
      let screenshot = null;
      try {
        screenshot = join(tmpdir(), "waygraph-chain-failure-" + Date.now() + ".png");
        await page.screenshot({ path: screenshot, fullPage: true });
      } catch {
        screenshot = null;
      }
      return {
        ok: false,
        failedAt: r.block.name,
        stepIndex: i,
        totalSteps: resolved.length,
        error: err && err.message ? err.message : String(err),
        steps,
        screenshot,
      };
    }
  }
  return { ok: true, result: steps.length > 0 ? steps[steps.length - 1].checkpoint : null, steps };
}

function isExpectedChainFailure(chainFlows, err) {
  if (!chainFlows || chainFlows.length === 0) return false;
  const last = chainFlows[chainFlows.length - 1];
  if (!last?.expectedFailureReason) return false;
  const msg = err && err.message ? err.message : String(err);
  return msg.includes("viewer-login") || msg.includes("reached-inventory-or-genuinely-blocked");
}

async function runChainedFlows(chainFlow, chainFlows, context, mem, page) {
  try {
    const outcome = await chainFlow(...chainFlows).run(context, mem, { page, closeOnFinish: false });
    return outcome?.result !== undefined ? outcome.result : outcome;
  } catch (err) {
    if (isExpectedChainFailure(chainFlows, err)) {
      return { __expectedFailure: true, message: err && err.message ? err.message : String(err) };
    }
    throw err;
  }
}

/** Parses WAYGRAPH_VIDEO_VIEWPORT / --video-viewport: "1920x1080" or "1920,1080". */
function parseVideoViewport(raw) {
  if (!raw || !raw.trim()) return null;
  const m = raw.trim().match(/^(\\d{3,5})[xX,](\\d{3,5})$/);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < 320 || height < 240 || width > 7680 || height > 4320) return null;
  return { width, height };
}

async function main() {
  const projectDir = process.argv[2];
  const spec = process.argv[3];
  const { connect, MemPage, Engine, start, end, chainFlow, isFastForwardBlock } = await import("waygraph");
  const mem = new MemPage();
  // Computed early - JSON-report mode's stdout is meant to be ONE parseable
  // JSON object for whatever's reading it afterward (a script, an agent),
  // not a human's console. Every informational console.log below is
  // skipped for it; only the final JSON report (or a thrown Error, for a
  // truly unexpected failure outside runJsonReportMode's own try/catch)
  // reaches stdout.
  const jsonReport = process.env.WAYGRAPH_JSON === "1";
  const ffExpand =
    process.env.WAYGRAPH_FF_EXPAND === "1" || process.env.WAYGRAPH_FF_DISABLED === "1";
  const ffDisabled = process.env.WAYGRAPH_FF_DISABLED === "1";
  /** Expand or keep fastForwardComposeBlock units for demo/run step lists. */
  const flattenBlockInfos = (blockInfos) => {
    const out = [];
    for (const bi of blockInfos) {
      const b = bi.block;
      if (ffExpand && isFastForwardBlock(b)) {
        for (const step of b.steps()) {
          out.push({
            name: step.name,
            block: step.block,
            ...(step.routes ? { routes: step.routes } : {}),
            ...(bi.resetSessionBefore ? { resetSessionBefore: true } : {}),
            // Dispute / --ff-disabled: keep blitz pacing on former FF inners so
            // wall-clock stays comparable to opaque FF (same real acts).
            wasFastForward: true,
            ffSource: b.name,
          });
        }
      } else {
        out.push(bi);
      }
    }
    return out;
  };
  let resolved = [];
  let chainFlows = null;
  // A bare identifier (no "(", no "then") might name an existing Flow
  // that's already wired up (e.g. loginFlow) - try that FIRST so pointing
  // at real, already-built flows needs no chain-spec typing at all. Falls
  // through to ordinary block-chain parsing if nothing matches.
  const bareRef = /^[A-Za-z_$][\\w]*$/.test(spec.trim()) ? spec.trim() : null;
  if (bareRef) {
    const flow = await findFlow(projectDir, bareRef);
    if (flow && typeof flow.blocks === "function") {
      const blockInfos = flattenBlockInfos(flow.blocks());
      // Same --data / WAYGRAPH_DATA seeding as the multi-segment path.
      // Without this, \`waygraph run shop.flow.ts --data '{...}'\` (and bare
      // export names) hit preflight with an empty MemPage.
      const seedMem = () => seedMemForFlow(mem, blockInfos, undefined, bareRef);
      resolved = blockInfos.map((bi, idx) => ({
        block: bi.block,
        exportName: bi.name,
        seedMem: idx === 0 ? seedMem : undefined,
        highlightFixtures: flow.highlightFixtures,
        demoPace: flow.demoPace,
        highlightStyle: flow.highlightStyle,
        expectedFailureReason:
          flow.expectedFailureReason && idx === blockInfos.length - 1
            ? flow.expectedFailureReason
            : undefined,
        ...(bi.wasFastForward ? { wasFastForward: true, ffSource: bi.ffSource } : {}),
      }));
      chainFlows = [flow];
      if (!jsonReport) {
        console.log(
          'waygraph: running existing flow "' + bareRef + '" - ' +
            resolved.map((r) => r.block.name).join(" -> ") + " (" + resolved.length + " block" +
            (resolved.length === 1 ? "" : "s") + ", no chain spec needed)",
        );
        if (ffDisabled) {
          console.error(
            "waygraph demo: --ff-disabled - FFCompose expanded to inners (dispute / step locus); blitz pacing kept on former FF steps",
          );
        }
      }
    }
  }
  if (resolved.length === 0) {
    const segments = parseChainSpec(spec);
    if (segments.length === 0) {
      throw new Error("waygraph chain: empty spec - give at least one block name");
    }
    // Each "then"-separated segment can ALSO name an existing Flow (a
    // Flow's own requires, unioned across its Blocks, take the same
    // JSON-payload shape a single Block's requires would), not just a
    // Block. "loginFlow then dashboardFlow" chains two whole Flows one
    // after another - a bare Block segment gets wrapped as its own
    // trivial one-Block Flow so the whole spec reduces to one thing:
    // chainFlow(...) does the actual sequencing (session-reset boundaries
    // included) that used to be hand-rolled here - this is a thin wrapper
    // over the real engine primitive, not a second copy of its logic.
    const wrapEngine = new Engine();
    const flows = [];
    // Parallel to flows - only a REAL named Flow (found via findFlow)
    // counts as an "episode" a human would want labeled; a bare Block
    // segment gets wrapped as its own trivial one-Block Flow so it can
    // still flow through chainFlow's sequencing uniformly, but it's not
    // an authored scenario and gets no episode number - keeps the plain
    // "quick ad hoc block chain" case free of meaningless "Episode 1"/
    // "Episode 2" labels on things that were never episodes to begin with.
    const flowMeta = [];
    let episodeCounter = 0;
    // seedMem is a closure, NOT called here - seeding every segment's own
    // json payload eagerly, all upfront during resolution, was a real bug:
    // mem is one shared object, so when two segments require the SAME key
    // (e.g. two segments both requiring LoginCreds, each with a DIFFERENT
    // payload - "login as standard_user then login as locked_out_user"),
    // the LAST segment resolved silently overwrote the first's value
    // before either segment had even started running - so the FIRST
    // segment's own blocks would run against the SECOND segment's
    // credentials. Deferred to execution time instead (runStepMode calls
    // this exactly once, right as each segment's first block is reached -
    // see resolved[i].seedMem below), same moment session-reset already
    // happens for the same reason.
    for (const seg of segments) {
      const flow = await findFlow(projectDir, seg.ref);
      if (flow && typeof flow.blocks === "function") {
        flows.push(flow);
        episodeCounter += 1;
        flowMeta.push({
          episodeNumber: episodeCounter,
          episodeTitle: flow.title || seg.ref,
          expectedFailureReason: flow.expectedFailureReason,
          highlightFixtures: flow.highlightFixtures,
          demoPace: flow.demoPace,
          highlightStyle: flow.highlightStyle,
          seedMem: () => seedMemForFlow(mem, flow.blocks(), seg.json, seg.ref),
        });
      } else {
        const r = await findBlock(projectDir, seg.ref);
        flows.push(wrapEngine.defineFlow([start, r.block, end]));
        flowMeta.push({
          episodeNumber: undefined,
          episodeTitle: undefined,
          highlightFixtures: undefined,
          demoPace: undefined,
          highlightStyle: undefined,
          seedMem: () => seedMemForBlock(mem, r, seg.json),
        });
      }
    }
    const combinedBlocks = flattenBlockInfos(chainFlow(...flows).blocks());
    let fi = 0;
    // Episode lengths must follow the same flatten so remainingInFlow stays aligned.
    const flowLengths = flows.map((f) => flattenBlockInfos(f.blocks()).length);
    let remainingInFlow = flowLengths[0];
    let isFirstOfSegment = true;
    resolved = combinedBlocks.map((bi) => {
      while (remainingInFlow === 0) {
        fi += 1;
        remainingInFlow = flowLengths[fi];
        isFirstOfSegment = true;
      }
      const meta = flowMeta[fi];
      const entry = {
        block: bi.block,
        exportName: bi.name,
        resetSession: bi.resetSessionBefore === true,
        episodeNumber: meta.episodeNumber,
        episodeTitle: meta.episodeTitle,
        highlightFixtures: meta.highlightFixtures,
        demoPace: meta.demoPace,
        highlightStyle: meta.highlightStyle,
        expectedFailureReason:
          meta.expectedFailureReason && remainingInFlow === 1 ? meta.expectedFailureReason : undefined,
        seedMem: isFirstOfSegment ? meta.seedMem : undefined,
        ...(bi.wasFastForward ? { wasFastForward: true, ffSource: bi.ffSource } : {}),
      };
      remainingInFlow -= 1;
      isFirstOfSegment = false;
      return entry;
    });
    chainFlows = flows;
    if (!jsonReport) {
      console.log(
        "waygraph: chaining " + resolved.map((r) => r.block.name).join(" -> ") +
          " (" + resolved.length + " block" + (resolved.length === 1 ? "" : "s") + ")",
      );
    }
  }
  const step = process.env.WAYGRAPH_STEP === "1";
  // Stepping through headless defeats the point for a MANUAL demo - a
  // human can't watch it. But an explicit WAYGRAPH_HEADED=0 always wins
  // over that default: --auto-play-video sets STEP=1 (it still needs the
  // overlay/narration machinery) AND HEADED=0 (unattended + recorded,
  // nobody has to watch a live window for it to be right).
  const headed =
    process.env.WAYGRAPH_HEADED === "0" ? false : process.env.WAYGRAPH_HEADED === "1" || step;
  // Step mode: blitz Playwright slowMo when any opaque FF **or** former-FF
  // inners (--ff-disabled) are in the resolved list. Explicit WAYGRAPH_SLOWMO wins.
  const hasFfBlitz = resolved.some(
    (r) =>
      r &&
      ((r.block && r.block.fastForward === true) || r.wasFastForward === true),
  );
  const slowMo = process.env.WAYGRAPH_SLOWMO !== undefined
    ? Number(process.env.WAYGRAPH_SLOWMO)
    : step
      ? hasFfBlitz
        ? 0
        : 350
      : undefined;
  if (step && hasFfBlitz && process.env.WAYGRAPH_SLOWMO === undefined && !jsonReport) {
    console.error(
      ffDisabled
        ? "waygraph demo: --ff-disabled (expanded) -> Playwright slowMo=0 on former FF steps (blitz; same acts as opaque FF)"
        : "waygraph demo: opaque FFCompose in flow -> Playwright slowMo=0 (blitz); set WAYGRAPH_SLOWMO to override",
    );
  }
  const baseURL = process.env.WAYGRAPH_BASE_URL;
  const title = process.env.WAYGRAPH_TITLE;
  // Comma-separated Block names (their real .name, e.g. "login") that
  // should blow past the overlay's own added dwell (ring pop, cursor
  // travel, typing delay, and that block's own gates) - "I want the login
  // block to be faster than the rest of the demo," Dan's own phrase.
  // FFCompose blocks get the same skipTheater automatically (no need to
  // list them here). Distinct from --fast (gates only).
  const fastBlockNames = new Set(
    (process.env.WAYGRAPH_FAST_BLOCKS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  // Off by default - a same-user chain (login -> dashboard -> ...) needs
  // to STAY authenticated across its own blocks. Only a chain deliberately
  // re-visiting an auth entry point (e.g. "login" appearing twice, to
  // demo the same flow starting fresh each time) needs this.
  const clearSession = process.env.WAYGRAPH_CLEAR_SESSION === "1";
  const videoEnv = process.env.WAYGRAPH_VIDEO;
  let videoDir = null;
  if (videoEnv) {
    videoDir = videoEnv === "1" ? join(projectDir, ".waygraph-videos") : videoEnv;
    mkdirSync(videoDir, { recursive: true });
  }
  /** Fixed 16:9 capture for --video (demo QA and headless run). Step+video no longer maximizes. */
  const DEFAULT_VIDEO_VIEWPORT = { width: 1920, height: 1080 };
  const DEFAULT_RUN_VIDEO_VIEWPORT = { width: 1280, height: 720 };
  const videoViewportParsed = parseVideoViewport(process.env.WAYGRAPH_VIDEO_VIEWPORT);
  const fixedVideoViewport = videoDir
    ? (videoViewportParsed ?? (step ? DEFAULT_VIDEO_VIEWPORT : DEFAULT_RUN_VIDEO_VIEWPORT))
    : null;
  const engine = new Engine({ headless: !headed, slowMo });
  let result;
  // Non-interactive execution (no --step) runs the whole chain as one
  // composed flow with no per-block loop of its own to defer seeding
  // into - it can't support two segments needing DIFFERENT values for the
  // SAME mem key (e.g. two segments both requiring LoginCreds, each with
  // its own payload). Fall back to seeding every segment eagerly, upfront -
  // the same limitation "chain" always had; only --step's own runStepMode
  // loop actually needs (and correctly supports, via resolved[i].seedMem)
  // per-segment differentiated values.
  if (!step && !jsonReport) {
    for (const r of resolved) {
      if (r.seedMem) r.seedMem();
    }
  }
  if (step || jsonReport || baseURL || videoDir) {
    const { chromium } = await import("playwright");
    // --start-maximized (step mode only): viewport: null alone only made
    // the PAGE content track the window - the actual browser WINDOW still
    // launched at Chromium's own default size/position, which stayed put
    // where it was for a previous, larger monitor and looked chopped off on
    // a smaller one. Maximizing fills whatever screen it's actually on.
    // Same CHROME_PATH/CHROMIUM_PATH rule as Engine.run(mem): prefer the
    // system/Flatpak Chromium when set, otherwise Playwright's bundled build.
    // Without this, STEP mode always launched a different-looking browser than
    // headed Engine runs / waygraph-demo.mjs (which already resolve Flatpak).
    const executablePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH || undefined;
    // Maximized for interactive step, and for fixed video viewport so the
    // locked record size can actually fit (otherwise .webm gets grey pad).
    const browser = await chromium.launch({
      headless: !headed,
      slowMo,
      args: step || fixedVideoViewport ? ["--start-maximized"] : [],
      ...(executablePath ? { executablePath } : {}),
    });
    const contextOpts = fixedVideoViewport
      ? {
          baseURL,
          viewport: fixedVideoViewport,
          // Lock DPR so --video-viewport 800x450 stays 800x450 in the .webm
          // (HiDPI hosts otherwise scale recordVideo to e.g. 1920x1080).
          deviceScaleFactor: 1,
          hasTouch: true,
        }
      : step
        ? { baseURL, viewport: null, hasTouch: true }
        : { baseURL, viewport: { width: 1280, height: 720 }, hasTouch: true };
    if (videoDir) {
      contextOpts.recordVideo = fixedVideoViewport
        ? { dir: videoDir, size: fixedVideoViewport }
        : { dir: videoDir };
    }
    const context = await browser.newContext(contextOpts);
    let pageForVideo = null;
    try {
      if (step) {
        const page = await context.newPage();
        pageForVideo = page;
        if (fixedVideoViewport) page.__wgVideoViewport = fixedVideoViewport;
        // Step 1's "before" panel used to sit over a blank about:blank page
        // until the human clicked Run - show the real destination first.
        if (baseURL) {
          await page.goto(baseURL).catch(() => {});
        }
        result = await runStepMode(engine, start, end, context, page, mem, resolved, slowMo, title, fastBlockNames, clearSession, baseURL);
      } else if (jsonReport) {
        const page = await context.newPage();
        pageForVideo = page;
        if (fixedVideoViewport) page.__wgVideoViewport = fixedVideoViewport;
        if (baseURL) {
          await page.goto(baseURL).catch(() => {});
        }
        const report = await runJsonReportMode(engine, start, end, context, page, mem, resolved, baseURL);
        console.log(JSON.stringify(report, null, 2));
        if (!report.ok) process.exitCode = 1;
        return;
      } else {
        const page = await context.newPage();
        pageForVideo = page;
        if (fixedVideoViewport) page.__wgVideoViewport = fixedVideoViewport;
        if (baseURL) {
          await page.goto(baseURL).catch(() => {});
        }
        if (chainFlows && chainFlows.length > 0) {
          result = await runChainedFlows(chainFlow, chainFlows, context, mem, page);
        } else {
          const blocks = resolved.map((r) => r.block);
          const chained = blocks.reduce((a, b) => connect(a, b));
          const flow = engine.defineFlow([start, chained, end]);
          result = await flow.run(context, mem, { page, closeOnFinish: false });
        }
      }
    } finally {
      await context.close();
      const savedVideo =
        pageForVideo?.video() !== null && pageForVideo?.video() !== undefined
          ? await pageForVideo.video()?.path().catch(() => null)
          : null;
      if (savedVideo) {
        console.log("waygraph: video saved to " + savedVideo);
      }
      await browser.close();
    }
  } else {
    if (chainFlows && chainFlows.length > 0) {
      try {
        result = await chainFlow(...chainFlows).run(mem);
      } catch (err) {
        if (isExpectedChainFailure(chainFlows, err)) {
          result = { __expectedFailure: true, message: err && err.message ? err.message : String(err) };
        } else {
          throw err;
        }
      }
    } else {
      const blocks = resolved.map((r) => r.block);
      const chained = blocks.reduce((a, b) => connect(a, b));
      const flow = engine.defineFlow([start, chained, end]);
      const recordVideo = videoDir ? { dir: videoDir } : undefined;
      result = await flow.run(mem, recordVideo ? { recordVideo } : undefined);
    }
  }
  if (result && result.__expectedFailure) {
    console.log("waygraph: chain finished (expected failure on last episode) -- " + result.message);
  } else {
    console.log("waygraph: chain finished -- " + JSON.stringify(result));
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});
`;

/**
 * Runs the chain runner script as a child process rooted at `projectDir` -
 * see {@link CHAIN_RUNNER_SCRIPT} for why this can't just be imported
 * in-process. `WAYGRAPH_BASE_URL` (relative `page.goto()` targets, like
 * every real zsign-all Block uses), `WAYGRAPH_HEADED=1`, and
 * `WAYGRAPH_SLOWMO=<ms>` pass straight through from this process's own env.
 */
async function runChain(projectDir: string, spec: string): Promise<void> {
  const expanded = await expandSpecFlowFiles(projectDir, spec);
  if (process.env.WAYGRAPH_VIDEO && !process.env.WAYGRAPH_BASE_URL) {
    const resolved = resolveBaseUrl(projectDir);
    if (resolved) process.env.WAYGRAPH_BASE_URL = resolved;
  }
  const tsxEsm = import.meta.resolve("tsx/esm");
  const scriptPath = join(projectDir, `.waygraph-chain-${process.pid}.mjs`);
  writeFileSync(scriptPath, CHAIN_RUNNER_SCRIPT);
  try {
    const code = await new Promise<number>((res, rej) => {
      const child = spawn(process.execPath, ["--import", tsxEsm, scriptPath, projectDir, expanded], {
        stdio: "inherit",
        env: process.env,
      });
      child.on("error", rej);
      child.on("exit", (code) => res(code ?? 1));
    });
    if (code !== 0) {
      process.exitCode = code;
    }
  } finally {
    rmSync(scriptPath, { force: true });
  }
}

// ---------------------------------------------------------------------------
// `try` - a bundled, self-contained showcase. No .flow.ts to write, no
// scenario to design - copies a small real Flow (nav/action Blocks, Trait
// verify, narrate()) into the target project and runs it in step mode
// against a public demo site, so a curious dev sees the real overlay/panel
// experience in under a minute, then gets pointed at the plain waygraph
// source that produced it.
// ---------------------------------------------------------------------------

/** This package's own installed root - dist/cli.js -> .. */
function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

interface TryPrereqStatus {
  ok: boolean;
  missing?: "waygraph" | "playwright-test" | "browser" | "unknown";
  detail?: string;
}

/**
 * Runs a throwaway probe script rooted at `projectDir` - the exact same
 * directory the real demo files get copied into, so it resolves "waygraph"
 * and "@playwright/test" exactly as they will - and actually launches (then
 * immediately closes) chromium, a real check rather than a guess at whether
 * the browser's installed. Never leaves the probe script behind.
 */
async function probeTryPrereqs(projectDir: string): Promise<TryPrereqStatus> {
  const tsxEsm = import.meta.resolve("tsx/esm");
  const probeScript = [
    "try {",
    '  await import("waygraph");',
    "} catch {",
    '  console.error("WAYGRAPH_TRY_MISSING_WAYGRAPH");',
    "  process.exit(1);",
    "}",
    "let mod;",
    "try {",
    '  mod = await import("@playwright/test");',
    "} catch {",
    '  console.error("WAYGRAPH_TRY_MISSING_PLAYWRIGHT_TEST");',
    "  process.exit(1);",
    "}",
    "try {",
    "  const browser = await mod.chromium.launch({ headless: true });",
    "  await browser.close();",
    "} catch (err) {",
    "  if (String(err && err.message).includes(\"Executable doesn't exist\")) {",
    '    console.error("WAYGRAPH_TRY_MISSING_BROWSER");',
    "    process.exit(1);",
    "  }",
    "  console.error(String((err && err.stack) || err));",
    "  process.exit(1);",
    "}",
  ].join("\n");
  const probePath = join(projectDir, `.waygraph-try-probe-${process.pid}.mjs`);
  writeFileSync(probePath, probeScript);
  try {
    const result = await new Promise<{ code: number; stderr: string }>((res, rej) => {
      const child = spawn(process.execPath, ["--import", tsxEsm, probePath], {
        cwd: projectDir,
        stdio: ["ignore", "ignore", "pipe"],
        env: process.env,
      });
      let stderrBuf = "";
      child.stderr?.on("data", (d) => { stderrBuf += d.toString(); });
      child.on("error", rej);
      child.on("exit", (code) => res({ code: code ?? 1, stderr: stderrBuf }));
    });
    if (result.code === 0) return { ok: true };
    const stderr = result.stderr;
    if (stderr.includes("WAYGRAPH_TRY_MISSING_WAYGRAPH")) return { ok: false, missing: "waygraph" };
    if (stderr.includes("WAYGRAPH_TRY_MISSING_PLAYWRIGHT_TEST")) return { ok: false, missing: "playwright-test" };
    if (stderr.includes("WAYGRAPH_TRY_MISSING_BROWSER")) return { ok: false, missing: "browser" };
    return { ok: false, missing: "unknown", detail: stderr.trim() || `probe exited with code ${result.code}` };
  } finally {
    rmSync(probePath, { force: true });
  }
}

/** Spawns with inherited stdio (the real npm/playwright output, visible) and resolves to its exit code. */
function runInherited(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit", env: process.env });
    child.on("error", rej);
    child.on("exit", (code) => res(code ?? 1));
  });
}

/** Installs deps + chromium inside an already-copied quickstart folder. */
async function ensureDirPrereqs(dir: string, label: string): Promise<string | null> {
  let status = await probeTryPrereqs(dir);
  if (status.ok) return null;

  if (!existsSync(join(dir, "package.json"))) {
    return `${label}: no package.json in ${dir}`;
  }

  if (status.missing === "waygraph" || status.missing === "playwright-test" || status.missing === "unknown") {
    // Copied quickstart must not keep a workspace-tainted lockfile (breaks temp-dir npm install).
    rmSync(join(dir, "package-lock.json"), { force: true });
    console.log(`${label}: installing dependencies in ${dir} ...`);
    const installCode = await runInherited("npm", ["install"], dir);
    if (installCode !== 0) {
      return `npm install exited with code ${installCode} - see the output above.`;
    }
    status = await probeTryPrereqs(dir);
    if (status.ok) return null;
    if (status.missing === "unknown") {
      return formatProbeFailure(status.detail ?? "probe failed");
    }
  }

  console.log(`${label}: downloading Playwright's chromium browser ...`);
  const localPlaywrightBin = join(dir, "node_modules", ".bin", "playwright");
  const browserCode = existsSync(localPlaywrightBin)
    ? await runInherited(localPlaywrightBin, ["install", "chromium"], dir)
    : await runInherited("npx", ["--yes", "playwright", "install", "chromium"], dir);
  if (browserCode !== 0) {
    return `"playwright install chromium" exited with code ${browserCode} - see the output above.`;
  }
  status = await probeTryPrereqs(dir);
  if (status.ok) return null;
  return formatProbeFailure(
    status.detail ?? "prerequisites still aren't ready after attempting to install them.",
  );
}

/** Playwright browser binary present but OS libs missing (common in Docker/Codespaces). */
function formatProbeFailure(detail: string): string {
  const needsDeps =
    /shared libraries|libnspr4|libnss3|libatk|cannot open shared object file/i.test(detail);
  const hint = needsDeps
    ? "\n\nChromium needs OS packages too - try:\n  sudo npx playwright install-deps chromium\n" +
      "In cloud/CI without a display, record headless:\n  npx waygraph try demo --video ./out --no-step"
    : "";
  return `couldn't verify prerequisites:\n${detail}${hint}`;
}

const TRY_DEMO_CHAIN =
  'loginFlow({"saucedemo.credentials":{"username":"standard_user","password":"secret_sauce"}}) then ' +
  'shopFlow({"saucedemo.selectedItem":{"id":"sauce-labs-backpack","name":"Sauce Labs Backpack"}}) then ' +
  'viewerBlockedFlow({"saucedemo.credentials":{"username":"locked_out_user","password":"secret_sauce"}})';

/**
 * Point a copied quickstart at this checkout's waygraph build (not npm registry).
 * Uses `npm pack` into destDir - a file: symlink to the dev tree can double-load
 * @playwright/test when sibling projects also install Playwright.
 */
async function wireQuickstartToPackageRoot(destDir: string): Promise<void> {
  const root = packageRoot();
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version as string;
  const packCode = await runInherited("npm", ["pack", "--pack-destination", destDir, "--silent"], root);
  if (packCode !== 0) {
    throw new Error(`waygraph try demo: npm pack failed with exit code ${packCode}`);
  }
  const tgz = join(destDir, `waygraph-${version}.tgz`);
  const pkgPath = join(destDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  if (!pkg.dependencies) pkg.dependencies = {};
  pkg.dependencies.waygraph = `file:${tgz}`;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

/**
 * Copy templates/quickstart into a fresh OS temp dir and wire it to this
 * package build. Returns destDir, or null after setting exitCode on failure.
 */
async function prepareTryQuickstart(label: string): Promise<string | null> {
  const destDir = mkdtempSync(join(tmpdir(), `${label}-`));
  cpSync(join(packageRoot(), "templates", "quickstart"), destDir, { recursive: true });
  rmSync(join(destDir, "node_modules"), { recursive: true, force: true });
  rmSync(join(destDir, "test-results"), { recursive: true, force: true });
  rmSync(join(destDir, "package-lock.json"), { force: true });
  try {
    await wireQuickstartToPackageRoot(destDir);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return null;
  }
  const problem = await ensureDirPrereqs(destDir, label);
  if (problem) {
    console.error(`${label}: couldn't get ready.\n${problem}`);
    process.exitCode = 1;
    return null;
  }
  return destDir;
}

/**
 * `waygraph try demo` - copy a self-contained saucedemo project into a temp
 * dir (never the caller's cwd), run a chainFlow step demo (Sign In + Shop +
 * blocked Viewer), then run the headless Playwright test, and print where
 * everything lives.
 */
async function runTryDemo(): Promise<void> {
  const destDir = await prepareTryQuickstart("waygraph-try-demo");
  if (!destDir) return;

  process.env.WAYGRAPH_BASE_URL ??= "https://www.saucedemo.com";
  process.env.WAYGRAPH_STEP ??= "1";
  process.env.WAYGRAPH_AUTOPLAY ??= "0";
  // Explicit --no-step --video = unattended headless .webm only (the
  // documented cloud/CI recipe above) - nobody needs to watch a live
  // window for Playwright's own recordVideo to capture the right thing.
  // This must be decided BEFORE the headed default below, or the
  // unconditional "??=" there always wins and the documented recipe never
  // actually runs headless.
  const unattendedVideo = Boolean(process.env.WAYGRAPH_VIDEO) && process.env.WAYGRAPH_STEP === "0";
  if (unattendedVideo) {
    process.env.WAYGRAPH_AUTOPLAY ??= "1";
    process.env.WAYGRAPH_HEADED ??= "0";
  } else {
    // Default: headed stepper, manual Next. --video records that session
    // too (not a headless rush) as long as --step is still on.
    process.env.WAYGRAPH_HEADED ??= "1";
  }

  const videoTo = process.env.WAYGRAPH_VIDEO;
  console.log(
    videoTo
      ? "waygraph try demo: step-through + record (Sign In -> Shop & Checkout -> blocked Viewer login) - click Next; video -> " +
          (videoTo === "1" ? ".waygraph-videos/" : videoTo)
      : "waygraph try demo: step-through (Sign In -> Shop & Checkout -> blocked Viewer login) - click Next for each step ...",
  );
  await runChain(destDir, TRY_DEMO_CHAIN);
  if (process.exitCode) return;

  console.log("\nwaygraph try demo: running headless chainFlow test ...");
  const testCode = await runInherited("npm", ["test"], destDir);
  if (testCode !== 0) {
    process.exitCode = testCode;
    return;
  }

  const testFile = join(destDir, "tests", "chain-flow.spec.ts");
  const loginFlowFile = join(destDir, "src", "flows", "login.flow.ts");
  const shopFlowFile = join(destDir, "src", "flows", "shop.flow.ts");
  const viewerBlockedFlowFile = join(destDir, "src", "flows", "viewer-blocked.flow.ts");

  console.log(
    "\nwaygraph try demo: done.\n\n" +
      "Temp project (does not touch your cwd - lives under the OS temp dir):\n" +
      `  ${destDir}\n\n` +
      "Episodes you just watched (same Flow objects the test imports):\n" +
      `  ${loginFlowFile}\n` +
      `  ${shopFlowFile}\n` +
      `  ${viewerBlockedFlowFile}\n\n` +
      "Headless chainFlow test (automated - no clicking):\n" +
      `  ${testFile}\n\n` +
      "Run again in that temp folder:\n" +
      `  cd ${destDir}\n` +
      "  npm run demo    # step-through, manual Next (--step --no-autoplay)\n" +
      "  npm run auto    # interactive explore (Effect Add/Remove, MemNav Open details)\n" +
      "  npm test        # playwright chainFlow test\n\n" +
      "Permanent full example in this package: examples/saucedemo\n" +
      "Keep a permanent scaffold in your tree: waygraph init my-app\n",
  );
}

const TRY_AUTO_DATA =
  '{"saucedemo.credentials":{"username":"standard_user","password":"secret_sauce"}}';

/**
 * `waygraph try auto` / `try auto:cli` - temp Sauce Demo explore.
 * Default is the **headed** browser panel. Pass `auto:cli` or `--cli` for the
 * terminal menu (same rows).
 *
 * Runs as a child in the temp project so Block imports share that install's
 * `@playwright/test`. In-process explore from the outer CLI against a packed
 * `file:*.tgz` copy double-loads Playwright and silently yields 0 graph edges
 * ("LoginPage / No moves").
 */
async function runTryAuto(opts: { cli: boolean } = { cli: false }): Promise<void> {
  const destDir = await prepareTryQuickstart("waygraph-try-auto");
  if (!destDir) return;

  process.env.WAYGRAPH_BASE_URL ??= "https://www.saucedemo.com";
  const cli = opts.cli === true;
  console.log(
    cli
      ? "waygraph try auto: CLI explore on Sauce Demo (temp dir).\n" +
          "  Creds pre-seeded (saucedemo.credentials).\n" +
          "  Pick [1] submit-login, then inventory Add/Remove / Open details.\n" +
          "  Type q to quit. Headed panel: waygraph try auto\n"
      : "waygraph try auto: headed explore on Sauce Demo (temp dir).\n" +
          "  Creds pre-seeded. CLI menu: waygraph try auto:cli\n" +
          "  Pick submit-login, then inventory menus. Quit from the panel.\n",
  );

  const bin = join(destDir, "node_modules", ".bin", "waygraph");
  const args = ["auto"];
  if (cli) args.push("--cli");
  args.push("--data", TRY_AUTO_DATA);
  const code = await runInherited(bin, args, destDir);
  if (code !== 0) process.exitCode = code;

  console.log(
    "\nwaygraph try auto: explorer closed.\n\n" +
      `Temp project:\n  ${destDir}\n\n` +
      "Run again:\n" +
      `  cd ${destDir} && npm run auto\n` +
      `  cd ${destDir} && npm run auto:cli\n\n` +
      "In-package: examples/saucedemo\n" +
      "Docs: https://deviate-dv8.github.io/waygraph/auto.html\n",
  );
}

// ---------------------------------------------------------------------------
// `validate`
// ---------------------------------------------------------------------------

interface FlowInfo {
  file: string;
  name: string;
  valid: boolean;
  error?: string;
}

async function validateFlows(projectDir: string): Promise<FlowInfo[]> {
  const files = discoverFlows(projectDir);
  const results: FlowInfo[] = [];
  for (const file of files) {
    try {
      const mod = await importFlowFile(file);
      for (const [exportName, exported] of Object.entries(mod)) {
        if (isFlowLike(exported)) {
          results.push({ file, name: exportName, valid: true });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ file, name: basename(file, ".ts"), valid: false, error: msg });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// `check` - secondary/complementary to the ActionPage @deprecated warning
// (src/types.ts). That's the primary, always-on signal an editor shows the
// instant a regular Block's act() calls a navigation method; this command
// sweeps a whole project in one shot for contexts with no editor watching
// (CI, an autonomous agent writing Block files without a language server).
// See openspec/specs/nav-block-and-check/spec.md for the full rationale.
// ---------------------------------------------------------------------------

function discoverBlocks(projectDir: string): string[] {
  return walkDir(projectDir, /\.block\.ts$/);
}

function isBlockLike(val: unknown): val is { name: string; instruction: { act: unknown } } {
  if (val === null || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  if (typeof obj.name !== "string") return false;
  const instruction = obj.instruction as Record<string, unknown> | undefined;
  return instruction !== null && typeof instruction === "object" && typeof instruction?.act === "function";
}

/** Set by `defineNavBlock` (non-enumerable) - see src/engine.ts. */
function isNavBlockMarked(val: Record<string, unknown>): boolean {
  return (val as { __waygraphKind?: string }).__waygraphKind === "nav";
}

const NAV_METHOD_CALLS = ["page.goto(", "page.reload(", "page.goBack(", "page.goForward("] as const;

/**
 * Matches a selector-taking Trait factory call whose first argument is a
 * literal string/template, not an identifier or property access - the exact
 * shape found repeatedly in hand-written assertion Blocks
 * (`Trait.visible("#some-id")` instead of `Trait.visible(SomeSel.thing)`).
 * `Trait.url(...)` is deliberately excluded - it takes a URLPatternInit, never
 * a DOM selector. Same file-scoped-regex bluntness the nav-escape sweep above
 * already accepts (see openspec/specs/nav-block-and-check/spec.md) - a known
 * blind spot on string concatenation/template-built selectors, not solved
 * here for the same "recipe before promotion" reason that check accepts its
 * own shared-helper blind spot.
 */
const INLINE_SELECTOR_CALL = /\b(?:Trait\.visible|Trait\.text|textEquals|visible)\(\s*["'`]/;

interface CheckWarning {
  file: string;
  blockName: string;
  exportName: string;
}

interface SelWarning {
  file: string;
  blockName: string;
  exportName: string;
}

/**
 * Walks every `*.block.ts` file under `projectDir`, imports each to find its
 * exported Blocks, and for any Block NOT built via `defineNavBlock`, scans
 * that file's own source text for a navigation call. Warning only - never
 * throws, never changes the caller's exit code on its own account (a Block
 * file that fails to import for unrelated reasons is silently skipped here;
 * `validate` is the command that reports import failures).
 */
function printOrphanReport(projectDir: string, orphans: Awaited<ReturnType<typeof findOrphanBlocks>>): void {
  if (orphans.length === 0) {
    console.log(`waygraph check: no orphan Blocks (every *.block.ts export is wired into a flow)`);
    return;
  }
  for (const o of orphans) {
    console.warn(
      `waygraph check: orphan Block ${o.file} (${o.exportName} / "${o.block}") is not referenced in any defineFlow([...]) - wire it into a .flow.ts before chain auto shorthand`,
    );
  }
  console.log(`waygraph check: ${orphans.length} orphan Block${orphans.length === 1 ? "" : "s"}`);
}

async function requireNoOrphans(projectDir: string, forCommand: string): Promise<boolean> {
  const orphans = await findOrphanBlocks(projectDir);
  if (orphans.length === 0) return true;
  console.error(
    `waygraph ${forCommand}: ${orphans.length} orphan Block(s) - wire every Block into a .flow.ts before auto shorthand. Run: waygraph check ${projectDir === process.cwd() ? "." : JSON.stringify(projectDir)}`,
  );
  for (const o of orphans) {
    console.error(`  - ${o.file} (${o.exportName} / "${o.block}")`);
  }
  process.exitCode = 1;
  return false;
}

async function runChainAuto(projectDir: string, fromTag: string, toTag: string): Promise<void> {
  if (!(await requireNoOrphans(projectDir, "chain auto"))) return;
  const graph = await discoverGraph(projectDir);
  const path = findBlockPath(graph, fromTag, toTag);
  if (!path) {
    console.error(`waygraph chain auto: no Block path from "${fromTag}" to "${toTag}" in the discovered graph`);
    process.exitCode = 1;
    return;
  }
  const spec = path.join(" then ");
  console.error(`waygraph chain auto: ${fromTag} -> ${toTag} via ${spec}`);
  if (!process.env.WAYGRAPH_BASE_URL) {
    const resolved = resolveBaseUrl(projectDir);
    if (resolved) process.env.WAYGRAPH_BASE_URL = resolved;
  }
  await runChain(projectDir, spec);
}

function initCommand(projectName: string): void {
  if (!projectName) {
    console.error("waygraph init: missing <project-name>, e.g. waygraph init my-app");
    process.exit(1);
  }
  const targetDir = resolve(process.cwd(), projectName);
  const pkgName = basename(targetDir);
  if (existsSync(targetDir)) {
    const entries = readdirSync(targetDir);
    if (entries.length > 0) {
      console.error(`waygraph init: "${targetDir}" already exists and is not empty`);
      process.exit(1);
    }
  } else {
    mkdirSync(targetDir, { recursive: true });
  }
  const templateDir = join(packageRoot(), "templates", "scaffold");
  if (!existsSync(templateDir)) {
    console.error(`waygraph init: scaffold template missing at ${templateDir}`);
    process.exit(1);
  }
  cpSync(templateDir, targetDir, { recursive: true });
  const gitignoreSrc = join(targetDir, "gitignore");
  if (existsSync(gitignoreSrc)) {
    writeFileSync(join(targetDir, ".gitignore"), readFileSync(gitignoreSrc, "utf-8"));
    rmSync(gitignoreSrc);
  }
  const packageJsonPath = join(targetDir, "package.json");
  writeFileSync(
    packageJsonPath,
    readFileSync(packageJsonPath, "utf-8").replaceAll("__PROJECT_NAME__", pkgName),
  );
  console.log(`Scaffolded ${pkgName}/`);
  console.log("");
  console.log(`  cd ${relative(process.cwd(), targetDir) || pkgName}`);
  console.log("  npm install");
  console.log("  npx playwright install chromium");
  console.log("  npm test");
  console.log("  waygraph list        # .flow.ts → export map");
  console.log("  waygraph check       # nav hygiene + orphan Blocks");
  console.log("  waygraph auto        # interactive explore (headed panel)");
  console.log("  waygraph auto --cli  # same menus in the terminal");
  console.log("  waygraph demo --blocks exampleFlow");
  console.log("  waygraph graph       # static state graph JSON");
  console.log("");
  console.log("  Layout: see STRUCTURE.md (or https://deviate-dv8.github.io/waygraph/scaffold.html)");
}

async function checkCommand(
  projectDir: string,
): Promise<{ navWarnings: CheckWarning[]; selWarnings: SelWarning[] }> {
  const files = discoverBlocks(projectDir);
  const navWarnings: CheckWarning[] = [];
  const selWarnings: SelWarning[] = [];
  for (const file of files) {
    let mod: Record<string, unknown>;
    try {
      mod = await importModule(file);
    } catch {
      continue;
    }
    let src: string | undefined;
    for (const [exportName, exported] of Object.entries(mod)) {
      if (!isBlockLike(exported)) continue;
      src ??= readFileSync(file, "utf-8");
      // Nav-escape: NavBlocks are exempt (their generated act() is the one
      // legitimate goto/click call site).
      if (
        !isNavBlockMarked(exported as Record<string, unknown>) &&
        NAV_METHOD_CALLS.some((needle) => src!.includes(needle))
      ) {
        navWarnings.push({ file, blockName: exported.name, exportName });
      }
      // Inline selector: applies to every Block kind, including NavBlocks -
      // a Nav's own `verify` array is just as likely to inline a selector.
      if (INLINE_SELECTOR_CALL.test(src)) {
        selWarnings.push({ file, blockName: exported.name, exportName });
      }
    }
  }
  return { navWarnings, selWarnings };
}

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
  /** demo/run: expand fastForwardComposeBlock inners as separate steps. */
  ffExpand?: boolean;
  /** demo/run: dispute mode — expand FF + keep blitz on former FF inners. */
  ffDisabled?: boolean;
  /** Positional args with run flags stripped. */
  positionals: string[];
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
function parseRunFlags(argv: string[]): RunFlags {
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
    } else if (a === "--ff-expand") {
      out.ffExpand = true;
    } else if (a === "--ff-disabled" || a === "--no-ff") {
      out.ffDisabled = true;
      out.ffExpand = true;
    } else if (a === "--non-headless") {
      out.nonHeadless = true;
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
function applyRunFlags(flags: RunFlags, opts?: { allowAutoPlayVideo?: boolean; allowDemoUi?: boolean }): void {
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
  if ((flags.fast || flags.fullStepper || flags.miniStepper || flags.todoPos) && !opts?.allowDemoUi) {
    console.error("waygraph: --fast / --full / --mini / --todo-left|--todo-right are demo-only flags");
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
function resolveBaseUrl(projectDir: string): string | undefined {
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
function applyDemoDefaults(projectDir: string): void {
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

function resolveProjectDir(flags: RunFlags, fallbackIndex = 0): string {
  const cand = flags.positionals[fallbackIndex] ?? process.cwd();
  return resolve(cand);
}

function resolveSpec(flags: RunFlags): string | undefined {
  return flags.blocks ?? flags.positionals[0];
}

/** `shop.flow.ts` / `src/flows/cart-bulk.flow.ts` / absolute path — not a Checkpoint or export id. */
function looksLikeFlowFileRef(ref: string): boolean {
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
async function expandSpecFlowFiles(projectDir: string, spec: string): Promise<string> {
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

const args = process.argv.slice(2);
const command = args[0];

function usage(): void {
  console.log(`waygraph -- graph project tool + engine CLI

Primary (less is more):
  waygraph auto  [project|.flow.ts]        Interactive explore (picker)
                 --cli                     Terminal menu instead of browser panel
                 --cli --detach            Run the --cli session as a background socket
                                           server; prints {sessionId, socketPath} and exits
                 --blocks <From> <To>      Graph path-find From->To, then run
                 --data '{...}'            Mem seed (same as demo/run)
                 (pass a .flow.ts to run that flow - same as run)
                 --cli --detach --non-headless  Detached session with a real visible browser
                                           (same --non-headless flag run/demo already use)
  waygraph auto send <sessionId> "<pick>"  Send one pick to a --detach session, print
                                           the resulting state as JSON (no TTY needed)
                 --timeout <ms>            Override the 15s default wait for this one call -
                                           a single Block can legitimately run a slow real
                                           interaction (e.g. a multi-step mouse drag)
  waygraph auto status <sessionId>         Read a --detach session's state (no side effects)
  waygraph auto attach <sessionId>         Reopen an interactive terminal against a
                                           running --detach session
  waygraph auto dom <sessionId>            Read the live page's structure (no side effects)
                 --mode aria|full          Default aria (Playwright ariaSnapshotJSON, AI mode);
                                           full = bounded raw DOM walk (tag/attrs/text/children)
                 --selector <sel>          Scope either mode to one element's subtree
                 --depth N                 Limit snapshot depth (aria: native; full: caller cap)
  waygraph auto trace <sessionId>          Read the session's Checkpoint/Block-level history
                                           (no side effects; not raw click/fill recording)
  waygraph auto console <sessionId>        Read the real browser console/pageerror messages and
                                           failed (4xx/5xx) network responses seen so far - for
                                           diagnosing a silent failure (e.g. a form submit that
                                           does nothing observable in the DOM) that inspectDom
                                           alone can't explain, since it only reads what actually
                                           rendered, not what the page/network actually said
  waygraph auto storage <sessionId>        Read localStorage/sessionStorage plus registered
                                           service workers (scope/active URL/state) - client-
                                           side state (push-subscription/auth tokens etc.) that
                                           never appears in the rendered DOM inspectDom reads
  waygraph auto click <sessionId> <sel>    Click a real element - works even with zero Blocks
                                           (Blind Pilot: act before any Block covers this)
  waygraph auto type <sessionId> <sel> <text>  Fill a real input the same way
  waygraph auto goto <sessionId> <url>     Navigate the real live page
  waygraph auto press <sessionId> <sel> <key>
                                           Presses a real key (Playwright name, e.g. Enter,
                                           Escape, Tab) on a real focused element - many real
                                           inline-edit inputs (no visible Save button until you
                                           type) commit on Enter, not blur/click-elsewhere
  waygraph auto upload <sessionId> <sel> <image|pdf|video|path>
                                           Fill a real <input type="file"> - a built-in stub
                                           (small, real, valid: assets/stubs/stub.png|pdf|mp4)
                                           or a caller-supplied file path
                 (click/type/goto/upload each re-detect the session's Checkpoint afterward,
                  same detection send/status already use)
  waygraph auto reload <sessionId>         Re-discover the project's Block library/graph
                                           from disk without restarting the session - picks
                                           up a Block written to disk mid-session
  waygraph auto reach <sessionId> <Checkpoint>  Path-find from here to Checkpoint and run
                                           the whole route in one call - not one auto send
                                           per step. Same findBlockPath BFS auto --blocks
                                           <From> <To> already uses, against this session's
                                           own live graph/position. Fails loud (not a guess)
                                           if a step has several live options on the page
                                           (an instanceOptions Block) - use send for that step
  waygraph auto resync <sessionId>         Force here to be re-detected from the real live
                                           page right now, discarding whatever was cached -
                                           fixes a session's tracked position going stale
                                           after anything OUTSIDE this session changed the
                                           page (e.g. a human clicking around in a visible
                                           --non-headless session someone is co-driving);
                                           send/reach never do this on their own, since they
                                           only re-detect when the position is already unknown
  waygraph pilot start                     Bootstrap for an agent: starts a --detach session
                                           (same as auto --cli --detach) AND reads back the
                                           whole project's Block graph (same as waygraph
                                           graph) in one call - {sessionId, socketPath,
                                           headless, graph, snapshot}. Drive it afterward with
                                           auto send/status/dom/trace <sessionId> - pilot start
                                           does not resolve, narrate, or act on anything itself;
                                           planning a multi-step request is the agent's job.
                 --non-headless            Real visible browser (same flag as auto/demo/run)
                 --base-url / --data       Same as auto/demo/run
  waygraph demo  [--blocks <flow|file|spec>]  Watch with step overlay (QA path)
                 --data '{...}'            Mem seed JSON (or inline flow({...}))
                 --auto-next               Auto-advance steps (alias: --autoplay)
                 --fast                    Shorter auto-next / Next gates (keeps smooth cursor)
                 --full                    Classic wrap-all block chips (default: carousel)
                 --mini                    Force compact mini panel (Hide pill + Next); alias --stepper-mini
                 --todo-left|--todo-right  Floating checklist dock side (also ctx.todoPos / WAYGRAPH_TODO_POS)
                 --ff-expand               Expand fastForwardComposeBlock inners as separate steps
                 --ff-disabled             Dispute: expand FF (alias --no-ff); blitz kept on those inners
                 --auto-play-video         Unattended + recorded: --auto-next + --video (+ step); headless
                 --auto-play-video-head    Same, but keep the browser visible (--non-headless)
                 --video [dir]             Record .webm (demo: headless unless --non-headless)
                 --video-viewport WxH       Recording size (default demo: 1920x1080)
                 --title / --base-url
  waygraph run   [--blocks <flow|file|spec>]  Execute (no overlay unless --step)
                 --data '{...}'
                 --non-headless            Show browser
                 --video [dir]             Record .webm
                 --video-viewport WxH       Recording size (default run: 1280x720)
                 --ff-expand               Same as demo (expand FFCompose inners)
                 --ff-disabled             Same as demo (dispute: expand FF)

Also:
  waygraph list | nav | validate | check | graph | init <name>
  waygraph map   [project]                 Waygraph Map convention enforcement: every static
                                           Nav/Page url must verbatim-match its src/map/ folder
                                           path ((group) segments excluded) - exits 1 on a
                                           violation, unlike check's warnings-only stance. A
                                           no-op (exit 0, informational) if the project has no
                                           src/map/ directory at all.
  waygraph traverse [project]              Graph crawl (Phase B-E)
                 --blocks <glob|/re/|sub>  Phase C: filter *.block.ts discovery
                 --parallel N              Phase D: N clone workers (max 4)
                 --session clone|inherit   Phase D: default clone
                 --from <Checkpoint>       Seed / start checkpoint
                 --data '{...}'            Mem seed
                 --max-steps N             Cap Block runs (default 50)
                 --max-visits N            Cap visits per node (default 2)
                 --non-headless            Show browser
  waygraph agent-dive [--loop claude|opencode|cursor|vscode] [--prompts]
                 Initialize coding-agent defs (Playwright init-agents analogue)
  waygraph try [demo|auto|auto:cli]        One-shot saucedemo in a temp dir
                 try auto                  Headed browser panel (default)
                 try auto:cli / --cli      Terminal menu instead
                 try auto --headed         Same as try auto (compat)

Examples:
  waygraph list                                          # file → export map
  waygraph run src/flows/shop.flow.ts --data '{...}'
  waygraph run --blocks shopFlow --non-headless --video
  waygraph demo --blocks src/flows/cart-bulk.flow.ts --auto-next --fast
  waygraph demo src/flows/shop.flow.ts --full
  waygraph try auto
  waygraph try auto:cli
  waygraph auto src/flows/shop.flow.ts --data '{...}'   # run by file (same as run)
  waygraph auto --cli --data '{"saucedemo.credentials":{...}}'
  waygraph auto --blocks LoginPage OrderComplete
  waygraph auto --blocks '/mailpit/'                     # Phase C filtered explore
  waygraph traverse --blocks '**/mailpit/**/*.block.ts'  # Phase C filtered crawl
  waygraph traverse --parallel 2 --session clone         # Phase D clone workers
  waygraph run  --blocks "loginFlow then add-all-to-cart" --data '{...}' --video

Aliases (compat): \`chain <spec>\` -> run --blocks; \`chain auto A B\` -> auto --blocks A B;
  --autoplay -> --auto-next. Prefer the primary verbs above.

Project path optional (defaults to cwd). Flags beat WAYGRAPH_* env.
\`run\`/\`demo\`/\`auto\`: Flow export, .flow.ts path, or "a then b" chain (auto also explores).
Hide stepper = compact "N / M · block" pill. Collapses while a step runs (clicks hit the page). Video mode stays compact.
`);
  process.exit(0);
}

async function main(): Promise<void> {
  if (!command || command === "--help" || command === "-h") {
    usage();
  }

  switch (command) {
    case "list": {
      const proj = resolve(args[1] ?? process.cwd());
      if (!existsSync(proj)) {
        console.error(`waygraph: no such directory: ${proj}`);
        process.exit(1);
      }
      listCommand(proj);
      break;
    }

    case "nav": {
      const flowName = args[1] && args[1] !== "." ? args[1] : undefined;
      const proj = resolve(args[2] ?? process.cwd());
      navCommand(proj, flowName);
      break;
    }

    case "validate": {
      const proj = resolve(args[1] ?? process.cwd());
      const results = await validateFlows(proj);
      let failed = 0;
      for (const r of results) {
        const rel = relative(proj, r.file);
        if (r.valid) {
          console.log(`OK    ${rel}  ${r.name}`);
        } else {
          failed++;
          console.log(`FAIL  ${rel}  ${r.name} -- ${r.error}`);
        }
      }
      if (failed > 0) process.exitCode = 1;
      break;
    }

    case "run": {
      const flags = parseRunFlags(args.slice(1));
      applyRunFlags(flags);
      const spec = resolveSpec(flags);
      if (!spec) {
        console.error(
          "waygraph run: missing flow/spec — e.g.\n" +
            "  waygraph run src/flows/shop.flow.ts\n" +
            "  waygraph run --blocks shopFlow\n" +
            "  waygraph list   # file → export map\n" +
            "  Flags: --blocks --data --non-headless --video [dir] --step/--no-step",
        );
        process.exit(1);
      }
      const proj = flags.blocks
        ? resolveProjectDir(flags, 0)
        : resolve(flags.positionals[1] ?? process.cwd());
      if (!existsSync(proj)) {
        console.error(`waygraph: no such directory: ${proj}`);
        process.exit(1);
      }
      if (!process.env.WAYGRAPH_BASE_URL) {
        const resolved = resolveBaseUrl(proj);
        if (resolved) process.env.WAYGRAPH_BASE_URL = resolved;
      }
      await runChain(proj, spec);
      break;
    }

    case "init": {
      initCommand(args[1] ?? "");
      break;
    }

    case "traverse": {
      if (args.includes("--step") || args.includes("--auto-next") || args.includes("--autoplay")) {
        console.error("waygraph traverse: --step / --auto-next not supported (not a demo)");
        process.exit(1);
      }
      const rest = args.slice(1);
      let from: string | undefined;
      let data: string | undefined;
      let maxSteps: number | undefined;
      let maxVisits: number | undefined;
      let maxEdge: number | undefined;
      let headed = false;
      let baseUrl: string | undefined;
      let blocksFilter: string | undefined;
      let parallel: number | undefined;
      let session: "clone" | "inherit" | undefined;
      let minEdgeCoverageRaw: string | undefined;
      let coverageOut: string | undefined;
      let noCoverageReport = false;
      let projectDir = process.cwd();
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i]!;
        if (a === "--from" || a.startsWith("--from=")) {
          from = a.startsWith("--from=") ? a.slice(7) : rest[++i];
          continue;
        }
        if (a === "--data" || a.startsWith("--data=")) {
          data = a.startsWith("--data=") ? a.slice(7) : rest[++i];
          continue;
        }
        if (a === "--blocks" || a.startsWith("--blocks=")) {
          if (a.startsWith("--blocks=")) {
            blocksFilter = a.slice("--blocks=".length);
          } else {
            const v = rest[++i];
            if (!v || v.startsWith("-")) {
              console.error(
                "waygraph traverse: --blocks needs a glob, /regex/, or path substring",
              );
              process.exit(1);
            }
            blocksFilter = v;
          }
          continue;
        }
        if (a === "--parallel" || a.startsWith("--parallel=")) {
          const v = a.startsWith("--parallel=") ? a.slice("--parallel=".length) : rest[++i];
          parallel = Number(v);
          continue;
        }
        if (a === "--session" || a.startsWith("--session=")) {
          const v = a.startsWith("--session=") ? a.slice("--session=".length) : rest[++i];
          if (v !== "clone" && v !== "inherit") {
            console.error('waygraph traverse: --session must be "clone" or "inherit"');
            process.exit(1);
          }
          session = v;
          continue;
        }
        if (a === "--min-edge-coverage" || a.startsWith("--min-edge-coverage=")) {
          minEdgeCoverageRaw = a.startsWith("--min-edge-coverage=")
            ? a.slice("--min-edge-coverage=".length)
            : rest[++i];
          continue;
        }
        if (a === "--coverage-out" || a.startsWith("--coverage-out=")) {
          coverageOut = a.startsWith("--coverage-out=")
            ? a.slice("--coverage-out=".length)
            : rest[++i];
          continue;
        }
        if (a === "--no-coverage-report") {
          noCoverageReport = true;
          continue;
        }
        if (a === "--max-steps" || a.startsWith("--max-steps=")) {
          const v = a.startsWith("--max-steps=") ? a.slice(12) : rest[++i];
          maxSteps = Number(v);
          continue;
        }
        if (a === "--max-visits" || a.startsWith("--max-visits=")) {
          const v = a.startsWith("--max-visits=") ? a.slice(13) : rest[++i];
          maxVisits = Number(v);
          continue;
        }
        if (a === "--max-visits-per-edge" || a.startsWith("--max-visits-per-edge=")) {
          const v = a.startsWith("--max-visits-per-edge=")
            ? a.slice("--max-visits-per-edge=".length)
            : rest[++i];
          maxEdge = Number(v);
          continue;
        }
        if (a === "--non-headless" || a === "--headed") {
          headed = true;
          continue;
        }
        if (a === "--base-url" || a.startsWith("--base-url=")) {
          baseUrl = a.startsWith("--base-url=") ? a.slice(11) : rest[++i];
          continue;
        }
        if (a === "--help" || a === "-h") {
          console.log(`waygraph traverse [project] [flags]

Graph crawl (RFC Phase B-E). Walks unused legal edges until a leaf,
budget kill, or first broken edge. --parallel N uses session clone + edge leases.

  --blocks <glob|/regex/|substr>  Phase C: filter *.block.ts discovery
  --parallel N            Phase D: N clone workers (default 1, max 4)
  --session clone|inherit Phase D: default clone; inherit refused if parallel>1
  --min-edge-coverage X   Phase E: suite gate 0.8 | 80% | 80 (exit 2 if below)
  --coverage-out PATH     Phase E: write JSON (default .waygraph-traverse/coverage.json)
  --no-coverage-report    Phase E: print Coverage line only (no JSON file)
  --from <Checkpoint>     start checkpoint (optional)
  --data '{...}'          Mem seed JSON
  --max-steps N           default 50 (per worker)
  --max-visits N          per-node visit cap (default 2)
  --max-visits-per-edge N default 1
  --non-headless          show browser
  --base-url URL

Examples:
  waygraph traverse --blocks '**/mailpit/**/*.block.ts'
  waygraph traverse --parallel 2 --session clone --max-steps 20
  waygraph traverse --min-edge-coverage 80% --coverage-out ./cov.json

PASS:  [Reached Leaf Node[traverse-1] at=... steps=N]
FAIL:  [Broke at edge[traverse-1] block=... from=... to=...]
COVER: [Coverage edges=H/T ratio=R% min=M% PASS|FAIL]
`);
          process.exit(0);
        }
        if (!a.startsWith("-")) {
          projectDir = resolve(a);
        }
      }
      if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
        console.error(`waygraph traverse: no such directory: ${projectDir}`);
        process.exit(1);
      }
      const blocksSelect = blocksFilter
        ? parseBlocksSelect(blocksFilter)
        : undefined;
      let minEdgeCoverage: number | undefined;
      if (minEdgeCoverageRaw !== undefined) {
        const parsed = parseMinEdgeCoverage(minEdgeCoverageRaw);
        if (parsed === null) {
          console.error(
            `waygraph traverse: --min-edge-coverage expects 0.8, 80%, or 80 (got ${JSON.stringify(minEdgeCoverageRaw)})`,
          );
          process.exit(1);
        }
        minEdgeCoverage = parsed;
      }
      const code = await runTraverse(projectDir, {
        ...(from ? { from } : {}),
        ...(data ? { data } : {}),
        ...(maxSteps !== undefined && Number.isFinite(maxSteps) ? { maxSteps } : {}),
        ...(maxVisits !== undefined && Number.isFinite(maxVisits)
          ? { maxVisitsPerNode: maxVisits }
          : {}),
        ...(maxEdge !== undefined && Number.isFinite(maxEdge)
          ? { maxVisitsPerEdge: maxEdge }
          : {}),
        headed,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
        ...(blocksSelect ? { blocksSelect } : {}),
        ...(parallel !== undefined && Number.isFinite(parallel) ? { parallel } : {}),
        ...(session ? { session } : {}),
        ...(minEdgeCoverage !== undefined ? { minEdgeCoverage } : {}),
        ...(coverageOut ? { coverageOut: resolve(coverageOut) } : {}),
        ...(noCoverageReport ? { noCoverageReport: true } : {}),
      });
      process.exit(code);
    }

    case "agent-dive":
    case "init-agents": {
      // Playwright analogue: npx playwright init-agents --loop <provider>
      const rest = args.slice(1);
      let loop: AgentDiveLoop = "claude";
      let prompts = false;
      let projectDir = process.cwd();
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i]!;
        if (a === "--prompts") {
          prompts = true;
          continue;
        }
        if (a === "--loop" || a.startsWith("--loop=")) {
          const v = a.startsWith("--loop=") ? a.slice("--loop=".length) : rest[++i];
          if (!v || !["claude", "opencode", "cursor", "vscode"].includes(v)) {
            console.error(
              "waygraph agent-dive: --loop must be claude | opencode | cursor | vscode",
            );
            process.exit(1);
          }
          loop = v as AgentDiveLoop;
          continue;
        }
        if (a === "--help" || a === "-h") {
          console.log(`waygraph agent-dive [--loop claude|opencode|cursor|vscode] [--prompts] [project]

Initialize coding-agent definitions for diving an app into waygraph Blocks
(Playwright \`init-agents\` analogue).

  --loop claude     write .claude/agents/*.md (default)
  --loop opencode   write .opencode/prompts/*.md
  --loop cursor     write .cursor/rules/waygraph-*.mdc
  --loop vscode     write .github/agents/*.md
  --prompts         also copy docs/waygraph-agents/*.md

Agents shipped: waygraph-planner, waygraph-author, waygraph-healer.
`);
          process.exit(0);
        }
        if (!a.startsWith("-")) {
          projectDir = resolve(a);
        }
      }
      if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
        console.error(`waygraph agent-dive: no such directory: ${projectDir}`);
        process.exit(1);
      }
      runAgentDive({ loop, projectDir, prompts });
      break;
    }

    case "chain": {
      // Compat alias: chain auto A B -> auto --blocks A B; else -> run --blocks.
      const flags = parseRunFlags(args.slice(1));
      applyRunFlags(flags);
      const first = flags.positionals[0];
      if (first === "auto") {
        const fromTag = flags.positionals[1];
        const toTag = flags.positionals[2];
        if (!fromTag || !toTag) {
          console.error("waygraph chain auto: missing <fromCheckpoint> <toCheckpoint> [project]");
          console.error("  prefer: waygraph auto --blocks LoggedIn OrderComplete");
          process.exit(1);
        }
        const proj = resolve(flags.positionals[3] ?? process.cwd());
        if (!existsSync(proj)) {
          console.error(`waygraph: no such directory: ${proj}`);
          process.exit(1);
        }
        await runChainAuto(proj, fromTag, toTag);
        break;
      }
      const spec = flags.blocks ?? first;
      if (!spec) {
        console.error(
          'waygraph chain: missing <spec> — prefer: waygraph run --blocks "a then b"\n' +
            "  or: waygraph auto --blocks <fromCheckpoint> <toCheckpoint>",
        );
        process.exit(1);
      }
      const proj = resolve(
        flags.blocks ? (flags.positionals[0] ?? process.cwd()) : (flags.positionals[1] ?? process.cwd()),
      );
      if (!process.env.WAYGRAPH_BASE_URL) {
        const resolved = resolveBaseUrl(proj);
        if (resolved) process.env.WAYGRAPH_BASE_URL = resolved;
      }
      // If caller asked for step overlay, behave like demo; else like run.
      if (flags.step === true || process.env.WAYGRAPH_STEP === "1") {
        applyDemoDefaults(proj);
      }
      await runChain(proj, spec);
      break;
    }

    case "demo": {
      const flags = parseRunFlags(args.slice(1));
      applyRunFlags(flags, { allowAutoPlayVideo: true, allowDemoUi: true });
      const spec = resolveSpec(flags);
      if (!spec) {
        console.error(
          "waygraph demo: missing flow/spec — e.g.\n" +
            "  waygraph demo src/flows/shop.flow.ts\n" +
            "  waygraph demo --blocks shopFlow\n" +
            "  Flags: --blocks --data --auto-next --fast --full --mini --ff-expand --ff-disabled --auto-play-video --title --base-url --video",
        );
        process.exit(1);
      }
      const proj = flags.blocks
        ? resolveProjectDir(flags, 0)
        : resolve(flags.positionals[1] ?? process.cwd());
      if (!existsSync(proj)) {
        console.error(`waygraph: no such directory: ${proj}`);
        process.exit(1);
      }
      if (flags.step === undefined && process.env.WAYGRAPH_STEP === undefined) {
        process.env.WAYGRAPH_STEP = "1";
      }
      applyDemoDefaults(proj);
      console.error(
        `waygraph demo: STEP=${process.env.WAYGRAPH_STEP === "1" ? "on" : "off"}` +
          ` AUTO_NEXT=${process.env.WAYGRAPH_AUTOPLAY === "1" ? "on" : "off"}` +
          ` HEADED=${process.env.WAYGRAPH_HEADED === "0" ? "off" : "on"}` +
          ` BASE_URL=${process.env.WAYGRAPH_BASE_URL ?? "(unset)"}` +
          (process.env.WAYGRAPH_VIDEO ? ` VIDEO=${process.env.WAYGRAPH_VIDEO}` : "") +
          (process.env.WAYGRAPH_TITLE ? ` TITLE=${JSON.stringify(process.env.WAYGRAPH_TITLE)}` : ""),
      );
      await runChain(proj, spec);
      break;
    }

    case "graph":
    case "auto": {
      // auto send|status|attach <sessionId> - session control against a
      // --detach'd background session. Intercepted before the normal
      // project-directory resolution below, same pattern `try demo|auto|
      // auto:cli` already uses for a sub-verb positional.
      if (
        command === "auto" &&
        (args[1] === "send" ||
          args[1] === "status" ||
          args[1] === "attach" ||
          args[1] === "dom" ||
          args[1] === "trace" ||
          args[1] === "console" ||
          args[1] === "storage" ||
          args[1] === "upload" ||
          args[1] === "click" ||
          args[1] === "type" ||
          args[1] === "press" ||
          args[1] === "goto" ||
          args[1] === "reload" ||
          args[1] === "reach" ||
          args[1] === "resync")
      ) {
        const sub = args[1];
        const sessionId = args[2];
        if (!sessionId) {
          console.error(`waygraph auto ${sub}: missing <sessionId>`);
          process.exit(1);
        }
        const proj = resolve(process.cwd());
        if (sub === "attach") {
          await runAttachLoop(proj, sessionId);
          break;
        }
        if (sub === "send") {
          const pick = args[3];
          if (pick === undefined) {
            console.error('waygraph auto send: usage: waygraph auto send <sessionId> "<pick>" [--timeout <ms>]');
            process.exit(1);
          }
          // Real, direct need found live: a single Block can legitimately
          // run a genuinely slow real interaction (e.g. a multi-step mouse
          // drag) that exceeds the 15s default - same reasoning `auto
          // reach` already gets a 90s default for (multiple Blocks in one
          // call). Unlike reach, send has no way to know ahead of time
          // whether the ONE Block it's running is fast or slow, so this is
          // opt-in via a flag rather than a raised default.
          let timeoutMs: number | undefined;
          for (let i = 4; i < args.length; i++) {
            if (args[i] === "--timeout") {
              const raw = args[++i];
              const n = Number(raw);
              if (!Number.isFinite(n) || n <= 0) {
                console.error(`waygraph auto send: --timeout must be a positive number of ms, got "${raw}"`);
                process.exit(1);
              }
              timeoutMs = n;
            }
          }
          const res = await requestSession(proj, sessionId, { op: "send", pick }, timeoutMs);
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "dom") {
          const domArgs = args.slice(3);
          let mode: "aria" | "full" | undefined;
          let selector: string | undefined;
          let depth: number | undefined;
          for (let i = 0; i < domArgs.length; i++) {
            const a = domArgs[i]!;
            if (a === "--mode" || a.startsWith("--mode=")) {
              const v = a.startsWith("--mode=") ? a.slice("--mode=".length) : domArgs[++i];
              if (v !== "aria" && v !== "full") {
                console.error(`waygraph auto dom: --mode must be "aria" or "full", got "${v}"`);
                process.exit(1);
              }
              mode = v;
            } else if (a === "--selector" || a.startsWith("--selector=")) {
              selector = a.startsWith("--selector=") ? a.slice("--selector=".length) : domArgs[++i];
            } else if (a === "--depth" || a.startsWith("--depth=")) {
              const raw = a.startsWith("--depth=") ? a.slice("--depth=".length) : domArgs[++i];
              const n = Number(raw);
              if (!Number.isInteger(n) || n < 1) {
                console.error(`waygraph auto dom: --depth must be a positive integer, got "${raw}"`);
                process.exit(1);
              }
              depth = n;
            } else {
              console.error(`waygraph auto dom: unrecognized argument "${a}"`);
              process.exit(1);
            }
          }
          const res = await requestSession(proj, sessionId, {
            op: "dom",
            ...(mode ? { mode } : {}),
            ...(selector ? { selector } : {}),
            ...(depth !== undefined ? { depth } : {}),
          });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "trace") {
          const res = await requestSession(proj, sessionId, { op: "trace" });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "console") {
          const res = await requestSession(proj, sessionId, { op: "console" });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "storage") {
          const res = await requestSession(proj, sessionId, { op: "storage" });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "click") {
          const selector = args[3];
          if (selector === undefined) {
            console.error('waygraph auto click: usage: waygraph auto click <sessionId> "<selector>"');
            process.exit(1);
          }
          const res = await requestSession(proj, sessionId, { op: "click", selector });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "type") {
          const selector = args[3];
          const text = args[4];
          if (selector === undefined || text === undefined) {
            console.error('waygraph auto type: usage: waygraph auto type <sessionId> "<selector>" "<text>"');
            process.exit(1);
          }
          const res = await requestSession(proj, sessionId, { op: "type", selector, text });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "press") {
          const selector = args[3];
          const key = args[4];
          if (selector === undefined || key === undefined) {
            console.error('waygraph auto press: usage: waygraph auto press <sessionId> "<selector>" <key>');
            process.exit(1);
          }
          const res = await requestSession(proj, sessionId, { op: "press", selector, key });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "goto") {
          const url = args[3];
          if (url === undefined) {
            console.error("waygraph auto goto: usage: waygraph auto goto <sessionId> <url>");
            process.exit(1);
          }
          const res = await requestSession(proj, sessionId, { op: "goto", url });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "upload") {
          const selector = args[3];
          const kindOrPath = args[4];
          if (selector === undefined || kindOrPath === undefined) {
            console.error(
              'waygraph auto upload: usage: waygraph auto upload <sessionId> "<selector>" <image|pdf|video|path-to-file>',
            );
            process.exit(1);
          }
          const stub: { selector: string; stub: "image" | "pdf" | "video" | { filePath: string } } =
            kindOrPath === "image" || kindOrPath === "pdf" || kindOrPath === "video"
              ? { selector, stub: kindOrPath }
              : { selector, stub: { filePath: resolve(process.cwd(), kindOrPath) } };
          const res = await requestSession(proj, sessionId, { op: "upload", ...stub });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "reload") {
          const res = await requestSession(proj, sessionId, { op: "reload" });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "reach") {
          const checkpoint = args[3];
          if (checkpoint === undefined) {
            console.error("waygraph auto reach: usage: waygraph auto reach <sessionId> <Checkpoint>");
            process.exit(1);
          }
          // Longer than every other op's default (15s): a real multi-step
          // route runs several real Blocks in sequence server-side before
          // responding - a legitimately slow single request, not a hang.
          const res = await requestSession(proj, sessionId, { op: "reach", checkpoint }, 90_000);
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        if (sub === "resync") {
          const res = await requestSession(proj, sessionId, { op: "resync" });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          break;
        }
        const res = await requestSession(proj, sessionId, { op: "status" });
        console.log(JSON.stringify(res));
        if (!res.ok) process.exitCode = 1;
        break;
      }

      const flags = parseRunFlags(args.slice(1));
      applyRunFlags(flags);
      const mermaid = flags.mermaid === true;
      const mapOnly = command === "graph" || flags.map === true;
      const cliPicker = flags.cli === true;
      const firstPos = flags.positionals[0];

      // auto src/flows/shop.flow.ts → run that flow (same as `run`). Do not
      // treat a .flow.ts path as a project directory (existsSync is true for files).
      if (command === "auto" && firstPos && looksLikeFlowFileRef(firstPos) && !flags.blocksFromTo) {
        const proj = resolve(process.cwd());
        if (!existsSync(proj) || !statSync(proj).isDirectory()) {
          console.error(`waygraph: no such directory: ${proj}`);
          process.exit(1);
        }
        if (!process.env.WAYGRAPH_BASE_URL) {
          const resolved = resolveBaseUrl(proj);
          if (resolved) process.env.WAYGRAPH_BASE_URL = resolved;
        }
        await runChain(proj, firstPos);
        break;
      }

      const proj = resolve(firstPos ?? process.cwd());
      if (!existsSync(proj)) {
        console.error(`waygraph: no such directory: ${proj}`);
        process.exit(1);
      }
      if (!statSync(proj).isDirectory()) {
        console.error(
          `waygraph ${command}: "${firstPos}" is a file, not a project directory\n` +
            "  run a flow:  waygraph auto src/flows/shop.flow.ts\n" +
            "  or explore:  waygraph auto\n" +
            "  or path-find: waygraph auto --blocks LoginPage OrderComplete",
        );
        process.exit(1);
      }

      // auto --cli --detach: start the explore session as a background socket
      // server instead of blocking in the interactive loop. Session control
      // only applies to --cli (spec: "Headful mode is unaffected").
      if (command === "auto" && flags.detach) {
        if (!cliPicker) {
          console.error("waygraph auto --detach requires --cli (headful has no session control)");
          process.exit(1);
        }
        const baseURL = flags.baseUrl ?? process.env.WAYGRAPH_BASE_URL ?? resolveBaseUrl(proj);
        try {
          const meta = await spawnDetachedSession({
            projectDir: proj,
            ...(baseURL ? { baseURL } : {}),
            ...(flags.nonHeadless ? { headless: false } : {}),
          });
          console.log(
            JSON.stringify({ sessionId: meta.sessionId, socketPath: meta.socketPath, headless: meta.headless }),
          );
        } catch (err) {
          console.error(`waygraph auto --detach: ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }
        break;
      }

      // auto --blocks From To  (graph path-find + run)
      // auto --blocks '/regex/' or '**/*.block.ts'  (Phase C file select → explore)
      if (command === "auto" && (flags.blocksFromTo || flags.blocks)) {
        if (flags.blocksFromTo) {
          const [fromTag, toTag] = flags.blocksFromTo;
          await runChainAuto(proj, fromTag, toTag);
          break;
        }
        if (flags.blocks && isFileSelectToken(flags.blocks)) {
          const blocksSelect = parseBlocksSelect(flags.blocks);
          const baseURL = flags.baseUrl ?? process.env.WAYGRAPH_BASE_URL ?? resolveBaseUrl(proj);
          await runAutoExplore(
            proj,
            baseURL
              ? { cli: cliPicker, baseURL, blocksSelect }
              : { cli: cliPicker, blocksSelect },
          );
          break;
        }
        console.error(
          "waygraph auto --blocks expects <fromCheckpoint> <toCheckpoint>\n" +
            "  or file select: --blocks '**/mailpit/**/*.block.ts' / --blocks '/mailpit/'\n" +
            '  e.g. waygraph auto --blocks LoginPage OrderComplete\n' +
            '  for a hand-named chain use: waygraph run --blocks "a then b"\n' +
            "  or: waygraph auto src/flows/shop.flow.ts",
        );
        process.exit(1);
      }

      if (mapOnly || mermaid) {
        const orphans = await findOrphanBlocks(proj);
        const graph = await discoverGraph(proj);
        if (mermaid) {
          console.log(toMermaid(graph));
        } else {
          console.log(JSON.stringify({ ...graph, orphans }, null, 2));
        }
        console.error(
          `waygraph graph: ${graph.nodes.length} node(s), ${graph.edges.length} edge(s), ` +
            `${graph.skipped.length} Block(s) skipped (Out not resolvable), ` +
            `${orphans.length} orphan Block(s)`,
        );
        if (orphans.length > 0) {
          console.error(
            "waygraph graph: orphan Blocks block auto --blocks path-find - wire each into a .flow.ts (waygraph check)",
          );
        }
        break;
      }
      const baseURL = flags.baseUrl ?? process.env.WAYGRAPH_BASE_URL ?? resolveBaseUrl(proj);
      await runAutoExplore(proj, baseURL ? { cli: cliPicker, baseURL } : { cli: cliPicker });
      break;
    }

    case "pilot": {
      if (args[1] !== "start") {
        console.error('waygraph pilot: usage: waygraph pilot start [--non-headless] [--base-url <url>] [--data <json>]');
        process.exit(1);
      }
      const flags = parseRunFlags(args.slice(2));
      applyRunFlags(flags);
      const proj = resolve(process.cwd());
      const baseURL = flags.baseUrl ?? process.env.WAYGRAPH_BASE_URL ?? resolveBaseUrl(proj);
      try {
        const result = await pilotStart({
          projectDir: proj,
          ...(baseURL ? { baseURL } : {}),
          ...(flags.nonHeadless ? { headless: false } : {}),
        });
        console.log(JSON.stringify(result));
      } catch (err) {
        console.error(`waygraph pilot start: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
      break;
    }

    // Hidden: the detached server's own entry point, spawned by
    // `spawnDetachedSession` (auto --cli --detach). Not documented in
    // usage() - not meant to be invoked directly by a person.
    case "__auto-serve": {
      const proj = resolve(args[1] ?? process.cwd());
      const flags = parseRunFlags(args.slice(2));
      const sessionIdIdx = args.indexOf("--session-id");
      const sessionId = sessionIdIdx >= 0 ? args[sessionIdIdx + 1] : undefined;
      if (!sessionId) {
        console.error("waygraph __auto-serve: missing --session-id");
        process.exit(1);
      }
      const baseURL = flags.baseUrl ?? process.env.WAYGRAPH_BASE_URL ?? resolveBaseUrl(proj);
      await runAutoServeCommand(
        {
          projectDir: proj,
          ...(baseURL ? { baseURL } : {}),
          ...(flags.nonHeadless ? { headless: false } : {}),
        },
        sessionId,
      );
      break;
    }

    case "try": {
      const flags = parseRunFlags(args.slice(1));
      applyRunFlags(flags);
      const modeRaw = (flags.positionals[0] ?? "demo").toLowerCase();
      // auto:cli / --cli = CLI; bare try auto = headed panel
      const mode =
        modeRaw === "auto:cli" || modeRaw === "auto-cli"
          ? "auto:cli"
          : modeRaw === "auto"
            ? "auto"
            : modeRaw;
      if (mode === "auto" || mode === "auto:cli") {
        const cli =
          mode === "auto:cli" || flags.cli === true
            ? true
            : flags.headed === true || flags.nonHeadless === true
              ? false
              : false; // try auto default = headed
        await runTryAuto({ cli });
      } else if (mode === "demo" || mode === "") {
        await runTryDemo();
      } else {
        console.error(
          `waygraph try: unknown mode "${modeRaw}" - use "demo", "auto", or "auto:cli"`,
        );
        process.exitCode = 1;
      }
      break;
    }

    case "check": {
      const proj = resolve(args[1] ?? process.cwd());
      const { navWarnings, selWarnings } = await checkCommand(proj);
      if (navWarnings.length === 0) {
        console.log(`waygraph check: no navigation found outside NavBlocks under ${proj}`);
      } else {
        for (const w of navWarnings) {
          const rel = relative(proj, w.file);
          console.warn(`waygraph check: ${rel} (${w.blockName}) calls page.goto/reload/goBack/goForward outside a NavBlock - consider defineNavBlock instead`);
        }
        console.log(`waygraph check: ${navWarnings.length} nav warning${navWarnings.length === 1 ? "" : "s"}`);
      }
      if (selWarnings.length === 0) {
        console.log(`waygraph check: no inline selectors found in verify arrays under ${proj}`);
      } else {
        for (const w of selWarnings) {
          const rel = relative(proj, w.file);
          console.warn(`waygraph check: ${rel} (${w.blockName}) has an inline selector literal in verify - move it into a *Sel object`);
        }
        console.log(`waygraph check: ${selWarnings.length} inline-selector warning${selWarnings.length === 1 ? "" : "s"}`);
      }
      const orphans = await findOrphanBlocks(proj);
      printOrphanReport(proj, orphans);
      // Warnings only - never fail exit code. Orphans are reported for
      // human/agent cleanup; chain auto refuses while any remain.
      break;
    }

    case "map": {
      const proj = resolve(args[1] ?? process.cwd());
      const result = await checkMap(proj);
      if (!result.hasMapDir) {
        console.log(
          `waygraph map: no src/map/ directory under ${proj} - nothing to check ` +
            "(this project isn't on the Waygraph Map convention, or hasn't been migrated yet)",
        );
        break;
      }
      console.log(`waygraph map: ${result.nodes.length} node(s) found under ${relative(proj, result.mapRoot)}`);
      if (result.violations.length === 0) {
        console.log("waygraph map: 0 violations - every static Nav/Page url verbatim-matches its folder path");
      } else {
        for (const v of result.violations) {
          console.error(`waygraph map: ${v.file} (${v.block}) - ${v.reason}`);
        }
        console.error(
          `waygraph map: ${result.violations.length} violation${result.violations.length === 1 ? "" : "s"}`,
        );
        // Unlike `check`'s warnings-only stance, a Map violation is exactly
        // the class of bug this command exists to catch (a fabricated
        // folder grouping that never matched the real site, e.g. the real
        // (auth)/signin/ mistake this command's own header comment cites) -
        // fail loud, not just warn.
        process.exitCode = 1;
      }
      break;
    }

    default:
      console.error(`waygraph: unknown command "${command}"`);
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
