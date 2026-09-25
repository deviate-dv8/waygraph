#!/usr/bin/env node
/**
 * Structure guard: keeps src/ from re-growing into files nobody (human or agent) can edit safely.
 *   1. Every src/**\/*.ts stays under MAX_LINES, unless listed in RATCHET - a per-file ceiling
 *      that may only go DOWN (lower the number when you shrink a file; never raise it).
 *   2. No circular value imports between src modules (type-only imports are ignored).
 * Run: npm run check:structure
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");
const MAX_LINES = 800;

/** Known-oversized files: current ceiling. Decompose, then lower or delete the entry. */
const RATCHET = {
  "cli.ts": 8800,
  "engine.ts": 2950,
  "highlights.ts": 2100,
  "auto-session.ts": 1100,
  "pilot-overlay.ts": 960,
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") && !p.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const files = walk(srcDir);
const problems = [];

for (const f of files) {
  const rel = relative(srcDir, f).replace(/\\/g, "/");
  const lines = readFileSync(f, "utf8").split("\n").length;
  const limit = RATCHET[rel] ?? MAX_LINES;
  if (lines > limit) {
    problems.push(
      `${rel}: ${lines} lines > ${limit}` +
        (RATCHET[rel] ? " (ratchet - this file may only shrink)" : ` (max ${MAX_LINES}; split it by concern)`),
    );
  }
}

// --- import cycles (value imports only) ---
const IMPORT_RE = /^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+["'](\.[^"']+)["']/gm;
const graph = new Map();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const deps = new Set();
  for (const m of src.matchAll(IMPORT_RE)) {
    const target = resolve(dirname(f), m[1].replace(/\.js$/, ".ts"));
    if (files.includes(target)) deps.add(target);
    else if (files.includes(join(target.replace(/\.ts$/, ""), "index.ts"))) deps.add(join(target.replace(/\.ts$/, ""), "index.ts"));
  }
  graph.set(f, deps);
}

const state = new Map();
const stack = [];
const cycles = [];
function dfs(n) {
  state.set(n, 1);
  stack.push(n);
  for (const d of graph.get(n) ?? []) {
    if (state.get(d) === 1) cycles.push([...stack.slice(stack.indexOf(d)), d]);
    else if (!state.get(d)) dfs(d);
  }
  stack.pop();
  state.set(n, 2);
}
for (const f of files) if (!state.get(f)) dfs(f);
for (const c of cycles) problems.push("import cycle: " + c.map((p) => relative(srcDir, p)).join(" -> "));

if (problems.length) {
  console.error("check:structure failed:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`check:structure ok (${files.length} files, no cycles, ${Object.keys(RATCHET).length} ratcheted)`);
