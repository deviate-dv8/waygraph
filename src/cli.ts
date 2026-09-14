#!/usr/bin/env node

/**
 * waygraph CLI -- tooling around this same package's engine.
 *
 * Commands:
 *   list    [project]            List discovered flows in a project
 *   nav     [flow] [project]     Print flow chain + navigation-only steps (goto / Trait.url)
 *   validate [project]           Import and validate all flows
 *   run <flow> [project]         Run a named flow with a fresh browser
 *   chain <spec> [project]       Run one or more Blocks by name, ad hoc, no flow file needed
 *
 * "project" defaults to the current directory.
 * A project is any directory containing *.flow.ts files (typically under src/flows/).
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, rmSync, type Dirent } from "node:fs";
import { resolve, relative, join, basename } from "node:path";
import { spawn } from "node:child_process";
import { MemPage } from "./mem-page.js";

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
import { readdirSync } from "node:fs";
import { join } from "node:path";

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

function seedMemForBlock(mem, resolved, json) {
  const requires = resolved.block.requires ?? [];
  if (requires.length === 0) {
    if (json !== undefined) {
      throw new Error(
        "waygraph chain: \\"" + resolved.exportName + "\\" takes no input (empty requires) but got a payload: " + json,
      );
    }
    return;
  }
  if (json === undefined) {
    throw new Error(
      "waygraph chain: \\"" + resolved.exportName + "\\" requires " + requires.map((k) => k.name).join(", ") +
        " - give a JSON payload, e.g. " + resolved.exportName + "({...})",
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error("waygraph chain: \\"" + resolved.exportName + "\\" payload is not valid JSON - " + String(err));
  }
  if (requires.length === 1) {
    mem.set(requires[0], parsed);
    return;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "waygraph chain: \\"" + resolved.exportName + "\\" requires " + requires.length + " keys (" +
        requires.map((k) => k.name).join(", ") + ") - payload must be an object keyed by each key's name",
    );
  }
  for (const k of requires) {
    if (!(k.name in parsed)) {
      throw new Error("waygraph chain: \\"" + resolved.exportName + "\\" payload is missing required key \\"" + k.name + "\\"");
    }
    mem.set(k, parsed[k.name]);
  }
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
  // help-center-clip-engine's #clip-cursor/#clip-ring (video-pipeline), a
  // real mouse pointer shape via clip-path so no separate image asset is
  // needed. Travel duration is JS-driven per call via --wg-cursor-ms, same
  // reason the clip engine's own comment gives: a hardcoded CSS duration
  // would make the speed param a no-op.
  "#wg-cursor{position:fixed;z-index:2147483647;width:22px;height:22px;pointer-events:none;" +
  "left:0;top:0;opacity:0;margin:0;" +
  "transition:transform var(--wg-cursor-ms,600ms) cubic-bezier(.22,1,.36,1),opacity .2s ease;" +
  "background:#fff;" +
  "clip-path:polygon(0 0, 0 70%, 22% 55%, 35% 85%, 48% 79%, 35% 50%, 62% 50%);" +
  "filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));}" +
  "#wg-click-pulse{position:fixed;z-index:2147483647;width:14px;height:14px;" +
  "margin-left:-7px;margin-top:-7px;border-radius:50%;pointer-events:none;opacity:0;" +
  "border:2px solid #7C3AED;background:rgba(124,58,237,.25);}" +
  "#wg-click-pulse.wg-pulse{animation:wg-pulse .5s ease-out;}" +
  "@keyframes wg-pulse{0%{opacity:.9;transform:scale(.4);}100%{opacity:0;transform:scale(2.4);}}" +
  "#wg-panel{position:fixed;z-index:2147483647;left:50%;bottom:12px;transform:translateX(-50%);" +
  "max-width:min(92vw,640px);max-height:calc(100vh - 24px);overflow-y:auto;box-sizing:border-box;" +
  "background:rgba(20,10,40,.94);color:#fff;border-radius:14px;" +
  "padding:16px 20px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.35);" +
  "opacity:0;transition:opacity .06s ease;}" +
  "#wg-panel.wg-in{opacity:1;}" +
  "#wg-panel .wg-auto{margin-top:10px;font:600 13px system-ui,sans-serif;color:#c9a6ff;}" +
  "#wg-panel h3{margin:0 0 8px;font-size:13px;color:#c9a6ff;font-weight:700;" +
  "letter-spacing:.02em;text-transform:uppercase;}" +
  "#wg-panel .wg-narration{margin:0 0 12px;font:italic 14px/1.4 system-ui,sans-serif;color:#f0e8ff;}" +
  "#wg-progress{height:4px;background:#2a1650;border-radius:2px;margin:0 0 12px;overflow:hidden;}" +
  "#wg-progress-bar{height:100%;background:#7C3AED;border-radius:2px;transition:width .3s ease;}" +
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
  "#wg-panel label{display:block;font-size:12px;color:#d8c8ff;margin-bottom:3px;}" +
  "#wg-panel textarea{width:100%;box-sizing:border-box;background:#0f0620;color:#fff;" +
  "border:1px solid #4b2a80;border-radius:8px;padding:6px 8px;font:12px/1.3 monospace;resize:vertical;}" +
  "#wg-panel button{margin-top:10px;background:#7C3AED;color:#fff;border:none;border-radius:8px;" +
  "padding:8px 16px;font:600 13px system-ui,sans-serif;cursor:pointer;}" +
  "#wg-panel button:hover{background:#6b2fd6;}" +
  "#wg-panel .wg-result{font:12px/1.4 monospace;background:#0f0620;border-radius:8px;padding:8px;" +
  "margin:8px 0;white-space:pre-wrap;}" +
  "#wg-panel .wg-result-pretty{font:600 14px/1.4 system-ui,sans-serif;}" +
  "#wg-panel .wg-toggle{display:flex;gap:4px;margin:0 0 4px;}" +
  "#wg-panel .wg-toggle button{margin:0;padding:3px 10px;font:600 11px system-ui,sans-serif;" +
  "background:transparent;border:1px solid #4b2a80;color:#9a7ad1;border-radius:6px;}" +
  "#wg-panel .wg-toggle button.wg-active{background:#4b2a80;color:#fff;}";

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
  await page
    .evaluate(
      ({ title, favicon, bannerPos }) => {
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
      },
      { title, favicon: WAYGRAPH_FAVICON, bannerPos },
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
      const old = document.getElementById("wg-panel");
      if (old) old.remove();
      const panel = document.createElement("div");
      panel.id = "wg-panel";
      const pct = Math.round((info.index / info.total) * 100);
      const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      const modulesHtml = info.allNames
        .map((name, idx) => {
          const cls = idx < info.index ? "wg-mod-done" : idx === info.index ? "wg-mod-current" : "wg-mod-upcoming";
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
          k.value.replace(/</g, "&lt;") + "</textarea></div>";
      }
      html += info.autoplay
        ? "<div class=\\"wg-auto\\">Auto-advancing...</div>"
        : "<button id=\\"wg-run\\">Run this step \\u25B6</button>";
      panel.innerHTML = html;
      document.documentElement.appendChild(panel);
      requestAnimationFrame(() => panel.classList.add("wg-in"));
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
      const old = document.getElementById("wg-panel");
      if (old) old.remove();
      const panel = document.createElement("div");
      panel.id = "wg-panel";
      const pct = Math.round(((info.index + 1) / info.total) * 100);
      const heading = info.isLast
        ? "End of chain - " + info.total + " / " + info.total + " blocks covered - " + info.blockName + " done"
        : "Step " + (info.index + 1) + " / " + info.total + " - " + info.blockName + " done";
      const buttonLabel = info.isLast ? "Finish" : "Next \\u25B6";
      const escA = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      const modulesHtml = info.allNames
        .map((name, idx) => {
          const cls = idx <= info.index ? "wg-mod-done" : "wg-mod-upcoming";
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
      const gateHtml = info.autoplay
        ? "<div class=\\"wg-auto\\">Auto-advancing...</div>"
        : "<button id=\\"wg-run\\">" + buttonLabel + "</button>";
      panel.innerHTML =
        "<div id=\\"wg-progress\\"><div id=\\"wg-progress-bar\\" style=\\"width:" + pct + "%\\"></div></div>" +
        "<div id=\\"wg-modules\\">" + modulesHtml + "</div>" +
        "<h3>" + heading + "</h3>" +
        resultHtml +
        gateHtml;
      document.documentElement.appendChild(panel);
      requestAnimationFrame(() => panel.classList.add("wg-in"));
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

async function moveCursorTo(page, box, ms) {
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page
    .evaluate(({ x, y, ms }) => {
      if (window.__wgMoveCursorTo) window.__wgMoveCursorTo(x, y, ms);
    }, { x, y, ms })
    .catch(() => {});
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

function instrumentInteractionHighlighting(page, mem, slowMo) {
  // Playwright's own slowMo ALREADY pauses after every single low-level
  // action it dispatches - and pressSequentially() fires one such action
  // PER CHARACTER. Also giving pressSequentially its own fixed delay
  // double-paces every keystroke (45ms + slowMo's own ~350ms, per
  // character) - an ordinary 22-character email alone stretched past 8
  // seconds. When slowMo is already doing the pacing, add none of our own;
  // only fall back to a small typing delay when slowMo is off entirely.
  const typeDelay = slowMo ? 0 : 30;
  // Click is a single action, not per-character, so it doesn't compound
  // the same way - but slowMo still adds its own pause around the actual
  // click, so trim our own explicit "pop" pauses when it's already active
  // rather than stacking a full 1.2s on top of that.
  const clickPrePop = slowMo ? 300 : 700;
  const clickPostPop = slowMo ? 200 : 500;
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
          await moveCursorTo(page, box, 500);
          await showRing(page, box, label);
          await new Promise((res) => setTimeout(res, 200));
        } else if (box) {
          // Ring/caption already handled by narrate() - still move the
          // cursor there, just skip re-showing the ring with a generic label.
          await moveCursorTo(page, box, 200);
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
        result = await this.pressSequentially(String(value), { delay: typeDelay, timeout: options && options.timeout });
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
          clickPoint = await moveCursorTo(page, box, 600);
          await showRing(page, box, label);
          // "pop for a few seconds" - Dan's own phrase, matching the
          // zsign demo-engine's ring-before-click pattern in
          // services/help-center-clip-engine's video-pipeline.
          await new Promise((res) => setTimeout(res, clickPrePop));
        } else if (box) {
          // Ring/caption already handled by narrate() - still move the
          // cursor + pulse the click point, just skip re-showing the ring.
          clickPoint = await moveCursorTo(page, box, 200);
        }
      } catch {
        // best-effort - the real click below still runs either way
      }
      if (clickPoint) await clickPulseAt(page, clickPoint.x, clickPoint.y);
      const result = await originalClick.call(this, options);
      await new Promise((res) => setTimeout(res, clickPostPop));
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
  // 3000ms was the first, deliberately conservative pass (this codebase
  // has documented real flakiness around slow-but-legitimate hydration
  // waits, so a too-aggressive cap risks trading "one annoying dead wait"
  // for "logins that sometimes fail outright"). Verified empirically
  // (3 consecutive real login runs, no failures) that those legitimate
  // waits actually resolve in well under a second in practice - the cap
  // was never close to touching them - so it's safe to tighten further.
  // Pushed lower than the earlier 1500ms pass: empirical data (3
  // consecutive real login runs) already showed every legitimate wait in
  // this codebase resolves in well under 100ms - nothing observed has
  // needed headroom anywhere near 1500ms, let alone this. Still re-verified
  // at this new value before shipping, same as every prior tightening.
  const WAIT_CAP_MS = 700;
  if (!proto.__wgWaitForPatched) {
    proto.__wgWaitForPatched = true;
    const originalWaitFor = proto.waitFor;
    proto.waitFor = function (options) {
      const capped = { ...(options || {}), timeout: Math.min((options && options.timeout) || 30000, WAIT_CAP_MS) };
      return originalWaitFor.call(this, capped);
    };
  }
  const pageProto = Object.getPrototypeOf(page);
  if (!pageProto.__wgWaitForTimeoutPatched) {
    pageProto.__wgWaitForTimeoutPatched = true;
    const originalWaitForTimeout = pageProto.waitForTimeout;
    pageProto.waitForTimeout = function (ms) {
      return originalWaitForTimeout.call(this, Math.min(ms, WAIT_CAP_MS));
    };
  }
}

async function runStepMode(engine, start, end, context, page, mem, resolved, slowMo, title) {
  instrumentInteractionHighlighting(page, mem, slowMo);
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
  // WAYGRAPH_AUTOPLAY=1 - hands-off, matching the existing
  // scripts/waygraph-demo.mjs pattern (plain slowMo, no clicks, just watch)
  // but keeping this overlay's progress bar/module breadcrumb/highlight.
  const autoplay = process.env.WAYGRAPH_AUTOPLAY === "1";
  const autoplayMs = process.env.WAYGRAPH_AUTOPLAY_MS ? Number(process.env.WAYGRAPH_AUTOPLAY_MS) : 1800;
  const gate = () => (autoplay ? new Promise((res) => setTimeout(() => res({}), autoplayMs)) : waitForNext());
  const allNames = resolved.map((r) => r.block.name);
  const allDescriptions = resolved.map((r) => r.block.description || "");

  let result;
  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i];
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
      allNames,
      allDescriptions,
      autoplay,
      title,
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
    const stepFlow = engine.defineFlow([start, r.block, end]);
    // { closeOnFinish: false } makes Flow.run return { result, page }, not
    // the plain checkpoint - destructure it, don't treat the wrapper as the
    // checkpoint itself (caught via the standalone verify script: this used
    // to serialize the whole { result, page } object into the panel/log).
    const stepOutcome = await stepFlow.run(context, mem, { page, closeOnFinish: false });
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
      allNames,
      allDescriptions,
      autoplay,
      title,
    });
    await gate();
  }
  return result;
}

async function main() {
  const projectDir = process.argv[2];
  const spec = process.argv[3];
  const { connect, MemPage, Engine, start, end } = await import("waygraph");
  const mem = new MemPage();
  let resolved = [];
  // A bare identifier (no "(", no "then") might name an existing Flow
  // that's already wired up (e.g. loginFlow) - try that FIRST so pointing
  // at real, already-built flows needs no chain-spec typing at all. Falls
  // through to ordinary block-chain parsing if nothing matches.
  const bareRef = /^[A-Za-z_$][\\w]*$/.test(spec.trim()) ? spec.trim() : null;
  if (bareRef) {
    const flow = await findFlow(projectDir, bareRef);
    if (flow && typeof flow.blocks === "function") {
      resolved = flow.blocks().map((bi) => ({ block: bi.block, exportName: bi.name }));
      console.log(
        "waygraph: running existing flow \\"" + bareRef + "\\" - " +
          resolved.map((r) => r.block.name).join(" -> ") + " (" + resolved.length + " block" +
          (resolved.length === 1 ? "" : "s") + ", no chain spec needed)",
      );
    }
  }
  if (resolved.length === 0) {
    const segments = parseChainSpec(spec);
    if (segments.length === 0) {
      throw new Error("waygraph chain: empty spec - give at least one block name");
    }
    for (const seg of segments) {
      const r = await findBlock(projectDir, seg.ref);
      seedMemForBlock(mem, r, seg.json);
      resolved.push(r);
    }
    console.log(
      "waygraph: chaining " + resolved.map((r) => r.block.name).join(" -> ") +
        " (" + resolved.length + " block" + (resolved.length === 1 ? "" : "s") + ")",
    );
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
  const engine = new Engine({ headless: !headed, slowMo });
  let result;
  if (step || baseURL) {
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
    const context = await browser.newContext(
      step ? { baseURL, viewport: null } : { baseURL, viewport: { width: 1280, height: 720 } },
    );
    try {
      if (step) {
        const page = await context.newPage();
        // Step 1's "before" panel used to sit over a blank about:blank page
        // until the human clicked Run - show the real destination first.
        if (baseURL) {
          await page.goto(baseURL).catch(() => {});
        }
        result = await runStepMode(engine, start, end, context, page, mem, resolved, slowMo, title);
      } else {
        const blocks = resolved.map((r) => r.block);
        const chained = blocks.reduce((a, b) => connect(a, b));
        const flow = engine.defineFlow([start, chained, end]);
        result = await flow.run(context, mem);
      }
    } finally {
      await browser.close();
    }
  } else {
    const blocks = resolved.map((r) => r.block);
    const chained = blocks.reduce((a, b) => connect(a, b));
    const flow = engine.defineFlow([start, chained, end]);
    result = await flow.run(mem);
  }
  console.log("waygraph: chain finished -- " + JSON.stringify(result));
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
  const tsxEsm = import.meta.resolve("tsx/esm");
  const scriptPath = join(projectDir, `.waygraph-chain-${process.pid}.mjs`);
  writeFileSync(scriptPath, CHAIN_RUNNER_SCRIPT);
  try {
    const code = await new Promise<number>((res, rej) => {
      const child = spawn(process.execPath, ["--import", tsxEsm, scriptPath, projectDir, spec], {
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
// `run`
// ---------------------------------------------------------------------------

async function runFlow(projectDir: string, flowName: string): Promise<void> {
  const files = discoverFlows(projectDir);
  for (const file of files) {
    let mod: Record<string, unknown>;
    try {
      mod = await importFlowFile(file);
    } catch {
      continue;
    }
    for (const [exportName, exported] of Object.entries(mod)) {
      if (!isFlowLike(exported) || exportName !== flowName) continue;
      console.log(`waygraph: running flow "${flowName}" from ${relative(projectDir, file)}`);
      const result = await exported.run(new MemPage());
      console.log(`waygraph: flow finished -- ${JSON.stringify(result)}`);
      return;
    }
  }
  console.error(`waygraph: no flow named "${flowName}" found under ${projectDir}`);
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// CLI plumbing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const command = args[0];

function usage(): void {
  console.log(`waygraph -- graph project tool + engine CLI

Usage:
  waygraph list    [project]      List discovered flows
  waygraph nav     [flow] [project]  Print flow chain + navigation steps
  waygraph validate [project]     Import and validate all flows
  waygraph run <flow> [project]   Run a named flow
  waygraph chain <spec> [project] Run one or more Blocks by name, ad hoc

    "chain" needs no .flow.ts file - reference Blocks (by their own
    runtime .name, or their export identifier) straight from the command
    line, chained with "then", each optionally given a JSON payload for
    whatever it requires:

      waygraph chain "login({\\"email\\":\\"a@b.com\\",\\"password\\":\\"x\\"}) then overview-metrics"

    A Block with no requires needs no payload. One with several required
    keys takes one JSON object keyed by each key's own name instead of a
    flat payload.

    Runs in a child process rooted at "project" (its own waygraph/playwright,
    never this CLI's) so a project's real Blocks resolve against its own
    node_modules. Env vars, all optional:
      WAYGRAPH_BASE_URL   base URL for Blocks using relative page.goto()
      WAYGRAPH_HEADED=1   show the browser instead of headless
      WAYGRAPH_SLOWMO=ms  slow down each Playwright action, for watching a run
      WAYGRAPH_STEP=1     human-verification mode - one Block at a time, a
                          browser overlay shows/lets you edit that Block's
                          MemKeys, a "Run this step" button gates it, then a
                          highlight ring shows whatever its verify Traits
                          just confirmed, then "Next" before moving on.
                          Implies headed - stepping through headless defeats
                          the point.
      WAYGRAPH_AUTOPLAY=1     step mode only - hands-off, advances on a
                          timer instead of waiting for clicks
      WAYGRAPH_AUTOPLAY_MS=ms delay between auto-advances (default 1800)
      WAYGRAPH_TITLE="..."    step mode only - a persistent top banner
                          naming what this whole run is about (default
                          top-left; click the banner to cycle left /
                          center / right)
      WAYGRAPH_TITLE_POS=left|center|right
                          initial banner position (default left); click
                          still cycles and remembers via localStorage

  "project" defaults to the current directory.
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
      const flowName = args[1];
      if (!flowName) {
        console.error("waygraph run: missing <flow>, e.g. waygraph run LoginFlow");
        process.exit(1);
      }
      const proj = resolve(args[2] ?? process.cwd());
      await runFlow(proj, flowName);
      break;
    }

    case "chain": {
      const spec = args[1];
      if (!spec) {
        console.error('waygraph chain: missing <spec>, e.g. waygraph chain "login({...}) then overview-metrics"');
        process.exit(1);
      }
      const proj = resolve(args[2] ?? process.cwd());
      await runChain(proj, spec);
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
