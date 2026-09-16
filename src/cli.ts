#!/usr/bin/env node

/**
 * waygraph CLI -- tooling around this same package's engine.
 *
 * Primary verbs (less is more):
 *   auto   Explore picker; `.flow.ts` / `--blocks From To` = run that path
 *   demo   Watch (step overlay); `--blocks` `--data` `--auto-next` `--auto-play-video`
 *   run    Execute; `--blocks` `--data` `--non-headless` `--video`
 *
 * Also: list / nav / validate / check / graph / init / try
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
import { runAutoExplore } from "./auto-explore-run.js";

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
  "#wg-ring{position:fixed;z-index:2147483646;pointer-events:none;opacity:0;" +
  "border:2.5px solid #7C3AED;border-radius:10px;" +
  "box-shadow:0 0 0 4px rgba(124,58,237,.16);transition:opacity .3s ease;}" +
  // A real element, not a ::after pseudo-element - a pseudo-element's
  // position is CSS-relative to the ring's own box (left:0 always meant
  // "the ring's own left edge"), so it had no way to be clamped back onto
  // screen when that box sat near a viewport edge - the label's text just
  // ran off, invisibly, with no overflow guard at all. A real sibling can
  // be measured (its actual rendered width) and repositioned in JS -
  // pushed back onto screen, same width, never shrunk. See
  // window.__wgPositionRing in installOverlay.
  "#wg-ring-label{position:fixed;z-index:2147483646;pointer-events:none;opacity:0;" +
  "white-space:nowrap;padding:4px 9px;border-radius:7px;background:#7C3AED;color:#fff;" +
  "font:600 12px/1.2 system-ui,sans-serif;transition:opacity .3s ease;}" +
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
  "#wg-click-pulse.wg-pulse{animation:wg-pulse .5s ease-out;}" +
  "@keyframes wg-pulse{0%{opacity:.9;transform:scale(.4);}100%{opacity:0;transform:scale(2.4);}}" +
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
  "#wg-panel .wg-narration{margin:0 0 12px;font:italic 14px/1.4 system-ui,sans-serif;color:#f0e8ff;}" +
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
  // The block breadcrumb below it is scoped to the CURRENT episode's own
  // blocks only, not the whole chain - "in episode 2 it shows 2nd to the
  // last... it should start from the first block" (Dan). An ad hoc block
  // chain with no episodes still shows the whole chain here, unchanged.
  "#wg-modules{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px;}" +
  "#wg-modules .wg-mod{padding:3px 9px;border-radius:6px;font:600 11px system-ui,sans-serif;}" +
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
  // Hide / Show chrome + mobile bottom-sheet layout (Dan: stepper + auto panels).
  "#wg-panel .wg-chrome{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px;}" +
  "#wg-panel .wg-chrome-title{font:700 11px/1.2 system-ui,sans-serif;color:#c9a6ff;" +
  "letter-spacing:.04em;text-transform:uppercase;}" +
  "#wg-panel button.wg-hide-btn{margin:0;padding:4px 10px;font:600 11px system-ui,sans-serif;" +
  "background:#3a2a60;color:#e8dcff;border:1px solid #5b3aa8;border-radius:6px;cursor:pointer;}" +
  "#wg-panel button.wg-hide-btn:hover{background:#4b2a80;}" +
  "#wg-panel.wg-collapsed{width:auto;max-width:90vw;padding:8px 12px;max-height:none;overflow:hidden;}" +
  "#wg-panel.wg-collapsed .wg-body{display:none;}" +
  "#wg-panel.wg-collapsed .wg-chrome{margin:0;}" +
  "@media (max-width:640px){" +
  "#wg-panel{left:8px;right:8px;bottom:8px;transform:none;max-width:none;width:auto;" +
  "max-height:min(55vh,calc(100vh - 16px));padding:12px 14px;border-radius:12px;}" +
  "#wg-panel.wg-collapsed{left:50%;right:auto;transform:translateX(-50%);width:auto;}" +
  "#wg-episodes{overflow-x:auto;-webkit-overflow-scrolling:touch;flex-wrap:nowrap;}" +
  "#wg-modules{gap:4px;}" +
  "#wg-panel .wg-narration{font-size:13px;}" +
  "#wg-panel button{width:100%;}" +
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
  const envAutoplay = process.env.WAYGRAPH_AUTOPLAY === "1";
  await page
    .evaluate(
      ({ title, favicon, bannerPos, envAutoplay }) => {
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
        window.__wgClickPulse = (x, y) => {
          const pulse = document.getElementById("wg-click-pulse");
          if (!pulse) return;
          pulse.style.left = x + "px";
          pulse.style.top = y + "px";
          pulse.classList.remove("wg-pulse");
          void pulse.offsetWidth;
          pulse.classList.add("wg-pulse");
        };
        // Clamps the ring AND its label to stay fully on-screen, same
        // width/height always - only the position moves. A target near a
        // viewport edge (real case: "login success" highlight landing top
        // right) used to just run the label text off-screen with no guard
        // at all - same mistake as the banner had before its own
        // left/center/right positions existed, not repeating it here by
        // shrinking anything, only repositioning.
        window.__wgPositionRing = (box, label) => {
          const ring = document.getElementById("wg-ring");
          const ringLabel = document.getElementById("wg-ring-label");
          if (!ring || !ringLabel) return;
          const margin = 6;
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          let left = box.x - 6;
          let top = box.y - 6;
          const width = box.width + 12;
          const height = box.height + 12;
          if (left < margin) left = margin;
          if (top < margin) top = margin;
          if (left + width > vw - margin) left = Math.max(margin, vw - margin - width);
          if (top + height > vh - margin) top = Math.max(margin, vh - margin - height);
          ring.style.left = left + "px";
          ring.style.top = top + "px";
          ring.style.width = width + "px";
          ring.style.height = height + "px";
          ring.style.opacity = "1";
          ringLabel.textContent = label;
          ringLabel.style.opacity = "1";
          // Measure the label's own natural width/height (its real
          // rendered size, unchanged) before deciding where it fits.
          const lw = ringLabel.offsetWidth;
          const lh = ringLabel.offsetHeight;
          let labelLeft = left;
          let labelTop = top + height + 8;
          if (labelTop + lh > vh - margin) labelTop = top - lh - 8; // flip above if it'd overflow the bottom
          if (labelTop < margin) labelTop = margin;
          if (labelLeft + lw > vw - margin) labelLeft = Math.max(margin, vw - margin - lw);
          if (labelLeft < margin) labelLeft = margin;
          ringLabel.style.left = labelLeft + "px";
          ringLabel.style.top = labelTop + "px";
        };
        window.__wgHideRing = () => {
          // While a narrate() call owns the ring (mid multi-step action),
          // the auto-highlight click/fill patches' own end-of-step hide is
          // a no-op - narrate() itself clears it once the WHOLE wrapped
          // action finishes, not just its first sub-step.
          if (window.__wgNarrateOwnsRing) return;
          const ring = document.getElementById("wg-ring");
          const ringLabel = document.getElementById("wg-ring-label");
          if (ring) ring.style.opacity = "0";
          if (ringLabel) ringLabel.style.opacity = "0";
        };
        const POSITIONS = ["left", "center", "right"];
        const applyPos = (el, pos) => {
          el.dataset.pos = pos;
          try {
            localStorage.setItem("wg-banner-pos", pos);
          } catch {
            /* private mode / blocked storage - position still applies this page */
          }
        };
        if (title && !document.getElementById("wg-banner")) {
          const banner = document.createElement("div");
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
          text.textContent = title;
          banner.appendChild(tag);
          banner.appendChild(text);
          document.documentElement.appendChild(banner);
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
        // Hide/Show for #wg-panel - call after every panel.innerHTML refresh.
        window.__wgWirePanelChrome = (panel, storageKey, chromeTitle) => {
          if (!panel) return;
          if (!panel.querySelector(":scope > .wg-chrome")) {
            const body = document.createElement("div");
            body.className = "wg-body";
            while (panel.firstChild) body.appendChild(panel.firstChild);
            const chrome = document.createElement("div");
            chrome.className = "wg-chrome";
            const titleEl = document.createElement("span");
            titleEl.className = "wg-chrome-title";
            titleEl.textContent = chromeTitle || "waygraph demo";
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "wg-hide-btn";
            btn.setAttribute("data-wg-toggle", "1");
            btn.textContent = "Hide";
            chrome.appendChild(titleEl);
            chrome.appendChild(btn);
            panel.appendChild(chrome);
            panel.appendChild(body);
          }
          const apply = (hidden) => {
            panel.classList.toggle("wg-collapsed", hidden);
            const t = panel.querySelector("[data-wg-toggle]");
            if (t) t.textContent = hidden ? "Show" : "Hide";
            try {
              localStorage.setItem(storageKey, hidden ? "1" : "0");
            } catch {
              /* private mode */
            }
          };
          let hidden = false;
          try {
            hidden = localStorage.getItem(storageKey) === "1";
          } catch {
            /* ignore */
          }
          apply(hidden);
          const toggle = panel.querySelector("[data-wg-toggle]");
          if (toggle && !toggle.dataset.wgWired) {
            toggle.dataset.wgWired = "1";
            toggle.addEventListener("click", (e) => {
              e.stopPropagation();
              apply(!panel.classList.contains("wg-collapsed"));
            });
          }
        };
      },
      { title, favicon: WAYGRAPH_FAVICON, bannerPos, envAutoplay },
    )
    .catch(() => {});
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
      let html =
        "<div id=\\"wg-progress\\"><div id=\\"wg-progress-bar\\" style=\\"width:" + pct + "%\\"></div></div>" +
        episodesHtml +
        "<div id=\\"wg-modules\\">" + modulesHtml + "</div>" +
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
      }
      if (window.__wgWirePanelChrome) window.__wgWirePanelChrome(panel, "wg-panel-hidden", "waygraph demo");
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
    }, info)
    .catch(() => {});
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
  // Cycle through EVERY declared/recovered highlight in order, each shown
  // long enough to actually register - "it highlights something [...] then
  // it highlights something [else] and next," not just the first one.
  for (let i = 0; i < highlights.length; i++) {
    const h = highlights[i];
    try {
      const box = await page.locator(h.selector).first().boundingBox();
      if (box) {
        await showRing(page, box, h.label);
        await new Promise((res) => setTimeout(res, i === highlights.length - 1 ? 200 : 900));
      }
    } catch {
      // best-effort - a selector that doesn't resolve just gets skipped
    }
  }
  if (highlights.length > 0) {
    // The LAST highlight is the one that stays lit while the human reads
    // the after-step panel - give THAT one live resize/scroll tracking,
    // same as before.
    const last = highlights[highlights.length - 1];
    await page
      .evaluate((h) => {
        if (!window.__wgPositionRing) return;
        const reposition = () => {
          const el = document.querySelector(h.selector);
          if (!el) {
            if (window.__wgHideRing) window.__wgHideRing();
            return;
          }
          window.__wgPositionRing(el.getBoundingClientRect(), h.label);
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
      panel.innerHTML =
        "<div id=\\"wg-progress\\"><div id=\\"wg-progress-bar\\" style=\\"width:" + pct + "%\\"></div></div>" +
        episodesHtml +
        "<div id=\\"wg-modules\\">" + modulesHtml + "</div>" +
        "<h3>" + heading + "</h3>" +
        resultHtml +
        gateHtml;
      if (isNewPanel) {
        document.documentElement.appendChild(panel);
        requestAnimationFrame(() => panel.classList.add("wg-in"));
      }
      if (window.__wgWirePanelChrome) window.__wgWirePanelChrome(panel, "wg-panel-hidden", "waygraph demo");
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
    }, info)
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
        "<div id=\\"wg-modules\\">" + modulesHtml + "</div>" +
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
      }
      if (window.__wgWirePanelChrome) window.__wgWirePanelChrome(panel, "wg-panel-hidden", "waygraph demo");
      const runBtn = document.getElementById("wg-run");
      if (runBtn) runBtn.addEventListener("click", () => window.__wgNext({}));
      const retryBtn = document.getElementById("wg-error-retry");
      if (retryBtn) retryBtn.addEventListener("click", () => window.__wgNext({ __wgRetry: "1" }));
    }, info)
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
  return highlights.filter((h) => h && typeof h.selector === "string" && typeof h.label === "string");
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
      highlights.push({ selector: m[1], label: name });
      continue;
    }
    m = /^text-equals\\((.+?),\\s*"/.exec(name);
    if (m) {
      highlights.push({ selector: m[1], label: name });
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
 */
async function markStepRunning(page) {
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
    })
    .catch(() => {});
}

async function showRing(page, box, label) {
  await page
    .evaluate(
      ({ box, label }) => {
        if (window.__wgPositionRing) window.__wgPositionRing(box, label);
      },
      { box, label },
    )
    .catch(() => {});
}

async function hideRing(page) {
  await page
    .evaluate(() => {
      if (window.__wgHideRing) window.__wgHideRing();
    })
    .catch(() => {});
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
      for (const id of ["wg-panel", "wg-ring", "wg-ring-label", "wg-cursor", "wg-click-pulse", "wg-banner"]) {
        const el = document.getElementById(id);
        if (el) el.remove();
      }
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

async function clickPulseAt(page, x, y) {
  await page
    .evaluate(({ x, y }) => {
      if (window.__wgClickPulse) window.__wgClickPulse(x, y);
    }, { x, y })
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

function instrumentInteractionHighlighting(page, mem, slowMo, pacing) {
  // Playwright's own slowMo ALREADY pauses after every single low-level
  // action it dispatches - and pressSequentially() fires one such action
  // PER CHARACTER. Also giving pressSequentially its own fixed delay
  // double-paces every keystroke (45ms + slowMo's own ~350ms, per
  // character) - an ordinary 22-character email alone stretched past 8
  // seconds. When slowMo is already doing the pacing, add none of our own;
  // only fall back to a small typing delay when slowMo is off entirely.
  //
  // Each is a function, not a plain const, and reads pacing.fast fresh
  // on every call - pacing is a shared mutable object runStepMode flips
  // per-block (WAYGRAPH_FAST_BLOCKS), and the Locator.fill/click patches
  // below are installed once on the shared prototype but invoked once per
  // real interaction, long after this closure was created.
  const typeDelay = () => (pacing.fast ? 0 : slowMo ? 0 : 30);
  // Click is a single action, not per-character, so it doesn't compound
  // the same way - but slowMo still adds its own pause around the actual
  // click, so trim our own explicit "pop" pauses when it's already active
  // rather than stacking a full 1.2s on top of that.
  const clickPrePop = () => (pacing.fast ? 0 : slowMo ? 300 : 700);
  const clickPostPop = () => (pacing.fast ? 0 : slowMo ? 200 : 500);
  const cursorMs = (full) => (pacing.fast ? Math.min(120, full) : full);
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
        const box = await this.boundingBox();
        if (box && !(await wasJustNarrated(page))) {
          // Only trust the "last mem.get()" as THIS fill's source if it
          // happened recently - a stale read from several actions ago is
          // more likely unrelated than actually describing this field.
          const label = memTrack.lastKeyName && Date.now() - memTrack.at < 3000
            ? "from mem: " + memTrack.lastKeyName
            : "writing from mem";
          await moveCursorTo(page, box, cursorMs(500));
          await showRing(page, box, label);
          await new Promise((res) => setTimeout(res, pacing.fast ? 0 : 200));
        } else if (box) {
          // Ring/caption already handled by narrate() - still move the
          // cursor there, just skip re-showing the ring with a generic label.
          await moveCursorTo(page, box, cursorMs(200));
        }
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
      // Fade the ring back out once this field is actually done, instead
      // of leaving it lit until the next Block's own before-panel clears
      // it - it was sticking around through the whole rest of the step.
      await hideRing(page);
      return result;
    };
  }

  if (!proto.__wgClickPatched) {
    proto.__wgClickPatched = true;
    const originalClick = proto.click;
    proto.click = async function (options) {
      let clickPoint = null;
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
        const box = await this.boundingBox();
        const narrated = box ? await wasJustNarrated(page) : false;
        if (box && !narrated) {
          let label = "click";
          try {
            const text = (await this.textContent())?.trim();
            if (text && text.length > 0 && text.length <= 30) label = text;
          } catch {
            // element has no simple text (an icon button, say) - generic label is fine
          }
          // Prefer "nav: …" when this locator is a NavBlock click target
          // (set on page by runStepMode just before act).
          try {
            const navLabel = await page.evaluate(() => window.__wgPendingNavClickLabel || null);
            if (navLabel) label = String(navLabel);
          } catch {
            /* ignore */
          }
          clickPoint = await moveCursorTo(page, box, cursorMs(600));
          await showRing(page, box, label);
          // "pop for a few seconds" - Dan's own phrase, matching the
          // zsign demo-engine's ring-before-click pattern in
          // services/help-center-clip-engine's video-pipeline.
          await new Promise((res) => setTimeout(res, clickPrePop()));
        } else if (box) {
          // Ring/caption already handled by narrate() - still move the
          // cursor + pulse the click point, just skip re-showing the ring.
          clickPoint = await moveCursorTo(page, box, cursorMs(200));
        }
      } catch {
        // best-effort - the real click below still runs either way
      }
      if (clickPoint) {
        await clickPulseAt(page, clickPoint.x, clickPoint.y);
        // clickPulseAt only triggers the CSS animation class - it doesn't
        // wait for it. Without a pause here, the real click (and any
        // resulting navigation/DOM change) fires while the ripple is still
        // mid-animation, sometimes cutting it off before it's even visible.
        // Wait out the same .5s the "@keyframes wg-pulse" rule uses, so the
        // mock click visually completes before the real one fires.
        await new Promise((res) => setTimeout(res, pacing.fast ? 0 : 500));
      }
      const result = await originalClick.call(this, options);
      await new Promise((res) => setTimeout(res, clickPostPop()));
      await hideRing(page);
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
  // WAYGRAPH_FAST_BLOCKS=login) can run through with none of the overlay's
  // own added dwell while the rest of the chain keeps the full theatrical
  // pace. Playwright's own slowMo is process-wide and untouched by this -
  // only OUR added pauses (ring pop, cursor travel, typing delay) shrink.
  const pacing = { fast: false };
  instrumentInteractionHighlighting(page, mem, slowMo, pacing);
  // Force the panel checkbox from this process's flags/env at run start.
  // installOverlay only seeds localStorage when the key is null (so mid-run
  // checkbox clicks survive navigations). Without this, a prior --autoplay
  // session sticks forever and agents cannot flip back with --no-autoplay.
  if (process.env.WAYGRAPH_AUTOPLAY !== undefined) {
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
  }
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
  // already is.
  page.setViewportSize = async () => {};
  let resolveNext = null;
  await page.exposeFunction("__wgNext", (edits) => {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r(edits);
    }
  });
  const waitForNext = () => new Promise((res) => (resolveNext = res));
  // WAYGRAPH_AUTOPLAY=1 only sets the STARTING checkbox state now - the
  // panel's own "Auto-advance" checkbox can flip it live, mid-run, and a
  // manual click always wins over an in-flight autoplay wait regardless of
  // which way the checkbox is set. That's the hybrid Dan asked for: some
  // steps auto-advance, some get a manual click, toggled as the demo goes,
  // not fixed for the whole run from a single env var.
  const autoplayMs = process.env.WAYGRAPH_AUTOPLAY_MS ? Number(process.env.WAYGRAPH_AUTOPLAY_MS) : 1800;
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
    const ms = pacing.fast ? Math.min(400, autoplayMs) : autoplayMs;
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
    }
    pacing.fast = fastBlockNames.has(r.block.name);
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
      title,
      episodeNumber: r.episodeNumber,
      episodeTitle: r.episodeTitle,
    });
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
    await markStepRunning(page);
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
      // A thrown act()/observe()/a failed verify Trait used to just crash
      // the whole Node process with a raw stack trace - the browser closes
      // (main()'s own try/finally) before a human watching ever sees WHY.
      // Show it on-screen and let a real click acknowledge it first.
      await renderStepError(page, {
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
      });
      const errEdits = await gate();
      if (errEdits && errEdits.__wgRetry) {
        // Same clean slate a normal episode boundary gets - not just
        // re-running the failed block against whatever broken/half-
        // navigated state it left the page in.
        await resetPageState(context, page, baseURL);
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
    const highlights = extractVerifyHighlights(r.block, result.__state);
    await renderAfterStep(page, {
      index: i,
      total: resolved.length,
      blockName: r.block.name,
      result,
      resultTag: JSON.stringify(result),
      highlights,
      isLast: i === resolved.length - 1,
      allNames: moduleNames,
      allDescriptions: moduleDescriptions,
      moduleIndex,
      allEpisodes,
      title,
      episodeNumber: r.episodeNumber,
      episodeTitle: r.episodeTitle,
    });
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

async function main() {
  const projectDir = process.argv[2];
  const spec = process.argv[3];
  const { connect, MemPage, Engine, start, end, chainFlow } = await import("waygraph");
  const mem = new MemPage();
  // Computed early - JSON-report mode's stdout is meant to be ONE parseable
  // JSON object for whatever's reading it afterward (a script, an agent),
  // not a human's console. Every informational console.log below is
  // skipped for it; only the final JSON report (or a thrown Error, for a
  // truly unexpected failure outside runJsonReportMode's own try/catch)
  // reaches stdout.
  const jsonReport = process.env.WAYGRAPH_JSON === "1";
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
      const blockInfos = flow.blocks();
      // Same --data / WAYGRAPH_DATA seeding as the multi-segment path.
      // Without this, \`waygraph run shop.flow.ts --data '{...}'\` (and bare
      // export names) hit preflight with an empty MemPage.
      const seedMem = () => seedMemForFlow(mem, blockInfos, undefined, bareRef);
      resolved = blockInfos.map((bi, idx) => ({
        block: bi.block,
        exportName: bi.name,
        seedMem: idx === 0 ? seedMem : undefined,
        expectedFailureReason:
          flow.expectedFailureReason && idx === blockInfos.length - 1
            ? flow.expectedFailureReason
            : undefined,
      }));
      chainFlows = [flow];
      if (!jsonReport) {
        console.log(
          "waygraph: running existing flow \\"" + bareRef + "\\" - " +
            resolved.map((r) => r.block.name).join(" -> ") + " (" + resolved.length + " block" +
            (resolved.length === 1 ? "" : "s") + ", no chain spec needed)",
        );
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
          seedMem: () => seedMemForFlow(mem, flow.blocks(), seg.json, seg.ref),
        });
      } else {
        const r = await findBlock(projectDir, seg.ref);
        flows.push(wrapEngine.defineFlow([start, r.block, end]));
        flowMeta.push({
          episodeNumber: undefined,
          episodeTitle: undefined,
          seedMem: () => seedMemForBlock(mem, r, seg.json),
        });
      }
    }
    const combinedBlocks = chainFlow(...flows).blocks();
    let fi = 0;
    let remainingInFlow = flows[0].blocks().length;
    let isFirstOfSegment = true;
    resolved = combinedBlocks.map((bi) => {
      while (remainingInFlow === 0) {
        fi += 1;
        remainingInFlow = flows[fi].blocks().length;
        isFirstOfSegment = true;
      }
      const meta = flowMeta[fi];
      const entry = {
        block: bi.block,
        exportName: bi.name,
        resetSession: bi.resetSessionBefore === true,
        episodeNumber: meta.episodeNumber,
        episodeTitle: meta.episodeTitle,
        expectedFailureReason:
          meta.expectedFailureReason && remainingInFlow === 1 ? meta.expectedFailureReason : undefined,
        seedMem: isFirstOfSegment ? meta.seedMem : undefined,
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
  // Stepping through headless defeats the point - a human can't watch it.
  const headed = process.env.WAYGRAPH_HEADED === "1" || step;
  // Step mode defaults to a visible pace (each fill/click actually shows on
  // screen instead of snapping in) unless the human overrides it - an
  // explicit WAYGRAPH_SLOWMO=0 still means "off".
  const slowMo = process.env.WAYGRAPH_SLOWMO !== undefined
    ? Number(process.env.WAYGRAPH_SLOWMO)
    : step
      ? 350
      : undefined;
  const baseURL = process.env.WAYGRAPH_BASE_URL;
  const title = process.env.WAYGRAPH_TITLE;
  // Comma-separated Block names (their real .name, e.g. "login") that
  // should blow past the overlay's own added dwell (ring pop, cursor
  // travel, typing delay, and that block's own gates) - "I want the login
  // block to be faster than the rest of the demo," Dan's own phrase.
  // Playwright's real slowMo is untouched; this only trims what waygraph
  // itself adds on top of it.
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
    const browser = await chromium.launch({
      headless: !headed,
      slowMo,
      args: step ? ["--start-maximized"] : [],
      ...(executablePath ? { executablePath } : {}),
    });
    const contextOpts = step
      ? { baseURL, viewport: null }
      : { baseURL, viewport: { width: 1280, height: 720 } };
    if (videoDir) {
      contextOpts.recordVideo = { dir: videoDir };
    }
    const context = await browser.newContext(contextOpts);
    let pageForVideo = null;
    try {
      if (step) {
        const page = await context.newPage();
        pageForVideo = page;
        // Step 1's "before" panel used to sit over a blank about:blank page
        // until the human clicked Run - show the real destination first.
        if (baseURL) {
          await page.goto(baseURL).catch(() => {});
        }
        result = await runStepMode(engine, start, end, context, page, mem, resolved, slowMo, title, fastBlockNames, clearSession, baseURL);
      } else if (jsonReport) {
        const page = await context.newPage();
        pageForVideo = page;
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
  // Default: headed stepper, manual Next. --video records that session (not headless rush).
  process.env.WAYGRAPH_HEADED ??= "1";
  process.env.WAYGRAPH_STEP ??= "1";
  process.env.WAYGRAPH_AUTOPLAY ??= "0";
  // Explicit --no-step --video = unattended headless .webm only.
  if (process.env.WAYGRAPH_VIDEO && process.env.WAYGRAPH_STEP === "0") {
    process.env.WAYGRAPH_AUTOPLAY ??= "1";
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
// See openspec/changes/nav-block-and-check/ for the full rationale.
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

interface CheckWarning {
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
    readFileSync(packageJsonPath, "utf-8").replaceAll("__PROJECT_NAME__", projectName),
  );
  console.log(`Scaffolded ${projectName}/`);
  console.log("");
  console.log(`  cd ${projectName}`);
  console.log("  npm install");
  console.log("  npx playwright install chromium");
  console.log("  npm test");
  console.log("  waygraph list        # .flow.ts → export map");
  console.log("  waygraph check       # nav hygiene + orphan Blocks");
  console.log("  waygraph auto        # interactive explore (headed panel)");
  console.log("  waygraph auto --cli  # same menus in the terminal");
  console.log("  waygraph demo src/flows/example.flow.ts");
  console.log("  waygraph graph       # static state graph JSON");
}

async function checkCommand(projectDir: string): Promise<CheckWarning[]> {
  const files = discoverBlocks(projectDir);
  const warnings: CheckWarning[] = [];
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
      if (isNavBlockMarked(exported as Record<string, unknown>)) continue;
      src ??= readFileSync(file, "utf-8");
      if (NAV_METHOD_CALLS.some((needle) => src!.includes(needle))) {
        warnings.push({ file, blockName: exported.name, exportName });
      }
    }
  }
  return warnings;
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
  /** Global Mem seed JSON (--data). */
  data?: string;
  /** Flow/chain spec from --blocks <spec>. */
  blocks?: string;
  /** auto path-find: --blocks <fromCheckpoint> <toCheckpoint>. */
  blocksFromTo?: [string, string];
  cli?: boolean;
  /** Force headed panel (compat; bare try auto / auto already headed). */
  headed?: boolean;
  mermaid?: boolean;
  map?: boolean;
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
    } else if (a === "--non-headless") {
      out.nonHeadless = true;
    } else if (a === "--cli") {
      out.cli = true;
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

/** Writes flag values into process.env so the chain child inherits them. Flags beat prior env. */
function applyRunFlags(flags: RunFlags, opts?: { allowAutoPlayVideo?: boolean }): void {
  if (flags.autoPlayVideo) {
    if (!opts?.allowAutoPlayVideo) {
      console.error("waygraph: --auto-play-video is a demo-only flag (QA watch + record)");
      process.exit(1);
    }
    if (flags.autoplay === undefined) flags.autoplay = true;
    if (flags.video === undefined) flags.video = "";
    if (flags.step === undefined) flags.step = true;
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
  if (flags.baseUrl !== undefined) {
    process.env.WAYGRAPH_BASE_URL = flags.baseUrl;
  }
  if (flags.title !== undefined) {
    process.env.WAYGRAPH_TITLE = flags.title;
  }
  if (flags.video !== undefined) {
    process.env.WAYGRAPH_VIDEO = flags.video || "1";
  }
  if (flags.data !== undefined) {
    process.env.WAYGRAPH_DATA = flags.data;
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
 * Friendly demo defaults: STEP+headed on, BASE_URL from package/env/playwright.
 * Call after applyRunFlags so explicit flags already won.
 */
function applyDemoDefaults(projectDir: string): void {
  if (process.env.WAYGRAPH_STEP === undefined) process.env.WAYGRAPH_STEP = "1";
  if (process.env.WAYGRAPH_STEP === "1" && process.env.WAYGRAPH_HEADED === undefined) {
    process.env.WAYGRAPH_HEADED = "1";
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
                 --blocks <From> <To>      Graph path-find From->To, then run
                 --data '{...}'            Mem seed (same as demo/run)
                 (pass a .flow.ts to run that flow - same as run)
  waygraph demo  [--blocks <flow|file|spec>]  Watch with step overlay (QA path)
                 --data '{...}'            Mem seed JSON (or inline flow({...}))
                 --auto-next               Auto-advance steps (alias: --autoplay)
                 --auto-play-video         QA: --auto-next + --video (+ step)
                 --title / --base-url
  waygraph run   [--blocks <flow|file|spec>]  Execute (no overlay unless --step)
                 --data '{...}'
                 --non-headless            Show browser
                 --video [dir]             Record .webm

Also:
  waygraph list | nav | validate | check | graph | init <name>
  waygraph try [demo|auto|auto:cli]        One-shot saucedemo in a temp dir
                 try auto                  Headed browser panel (default)
                 try auto:cli / --cli      Terminal menu instead
                 try auto --headed         Same as try auto (compat)

Examples:
  waygraph list                                          # file → export map
  waygraph run src/flows/shop.flow.ts --data '{...}'
  waygraph run --blocks shopFlow --non-headless --video
  waygraph demo --blocks src/flows/cart-bulk.flow.ts --auto-next
  waygraph try auto
  waygraph try auto:cli
  waygraph auto src/flows/shop.flow.ts --data '{...}'   # run by file (same as run)
  waygraph auto --cli --data '{"saucedemo.credentials":{...}}'
  waygraph auto --blocks LoginPage OrderComplete
  waygraph run  --blocks "loginFlow then add-all-to-cart" --data '{...}' --video

Aliases (compat): \`chain <spec>\` -> run --blocks; \`chain auto A B\` -> auto --blocks A B;
  --autoplay -> --auto-next. Prefer the primary verbs above.

Project path optional (defaults to cwd). Flags beat WAYGRAPH_* env.
\`run\`/\`demo\`/\`auto\`: Flow export, .flow.ts path, or "a then b" chain (auto also explores).
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
      applyRunFlags(flags, { allowAutoPlayVideo: true });
      const spec = resolveSpec(flags);
      if (!spec) {
        console.error(
          "waygraph demo: missing flow/spec — e.g.\n" +
            "  waygraph demo src/flows/shop.flow.ts\n" +
            "  waygraph demo --blocks shopFlow\n" +
            "  Flags: --blocks --data --auto-next --auto-play-video --title --base-url --video",
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
          ` BASE_URL=${process.env.WAYGRAPH_BASE_URL ?? "(unset)"}` +
          (process.env.WAYGRAPH_VIDEO ? ` VIDEO=${process.env.WAYGRAPH_VIDEO}` : "") +
          (process.env.WAYGRAPH_TITLE ? ` TITLE=${JSON.stringify(process.env.WAYGRAPH_TITLE)}` : ""),
      );
      await runChain(proj, spec);
      break;
    }

    case "graph":
    case "auto": {
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

      // auto --blocks From To  (graph path-find + run)
      if (command === "auto" && (flags.blocksFromTo || flags.blocks)) {
        if (flags.blocksFromTo) {
          const [fromTag, toTag] = flags.blocksFromTo;
          await runChainAuto(proj, fromTag, toTag);
          break;
        }
        console.error(
          "waygraph auto --blocks expects <fromCheckpoint> <toCheckpoint>\n" +
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
      const warnings = await checkCommand(proj);
      if (warnings.length === 0) {
        console.log(`waygraph check: no navigation found outside NavBlocks under ${proj}`);
      } else {
        for (const w of warnings) {
          const rel = relative(proj, w.file);
          console.warn(`waygraph check: ${rel} (${w.blockName}) calls page.goto/reload/goBack/goForward outside a NavBlock - consider defineNavBlock instead`);
        }
        console.log(`waygraph check: ${warnings.length} nav warning${warnings.length === 1 ? "" : "s"}`);
      }
      const orphans = await findOrphanBlocks(proj);
      printOrphanReport(proj, orphans);
      // Nav warnings only - never fail exit code. Orphans are reported for
      // human/agent cleanup; chain auto refuses while any remain.
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
