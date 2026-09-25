// Moved verbatim from the former CHAIN_RUNNER_SCRIPT template string in cli.ts (see src/ARCHITECTURE.md).
// Runs inside the target project's own waygraph copy - keep it dependency-light and self-contained.
import { demoPaceIsFast, demoPaceIsSlow, formatDemoPaceBadge, formatDemoPaceLabel, normalizeDemoPace, normalizeHighlightTone } from "../highlights.js";
import { join } from "node:path";

export function demoPaceKind(pace) {
  const p = normalizeDemoPace(pace);
  if (typeof p === "number" && p > 20) return "ms";
  if (typeof p === "number") return demoPaceIsSlow(p) ? "num-slow" : demoPaceIsFast(p) ? "fast" : "normal";
  if (p === "blitz" || p === "fast" || p === "slow") return p;
  return "normal";
}


export function paceSpeakFields(pace, baseAutoplayMs) {
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

export const ANSI = {
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

export function ansiPaint(code, text) {
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

export function demoLog(msg) {
  if (demoQuiet()) return;
  console.log(demoPrefix() + msg);
}

/** Fixture catch-all: how it was called + value. */
export function demoFixture(kind, call, value) {
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
export function demoHighlight(h, extra) {
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

export function logStubPhaseFixtures(phaseName, phase) {
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
export function logTodoDockFull(dock, tag) {
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

export function summarizeDevice(d) {
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
