#!/usr/bin/env node
/**
 * Structure guard: keeps src/ from re-growing into files nobody (human or agent) can edit safely.
 *   1. Every src/**\/*.ts stays under MAX_LINES, unless listed in RATCHET - a per-file ceiling
 *      that may only go DOWN (lower the number when you shrink a file; never raise it).
 *   2. No circular value imports between src modules (type-only imports are ignored).
 *   3. Layers: each file's layer may only import the layers allowed for it; scripts/layer-debt.json may only shrink.
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
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if ((p.endsWith(".ts") && !p.endsWith(".d.ts")) || p.endsWith(".js")) out.push(p);
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
    const asJs = resolve(dirname(f), m[1]);
    const target = asJs.replace(/\.js$/, ".ts");
    if (files.includes(target)) deps.add(target);
    else if (files.includes(asJs)) deps.add(asJs);
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

// --- layers (see src/ARCHITECTURE.md) ---
// Each file belongs to one layer; a layer may only import the layers listed for it. Existing violations are in
// scripts/layer-debt.json: that list may only shrink (a fixed violation must be removed from it, a new one fails).
const LAYER_OF = [
  ["core/", "core"], ["core.ts", "core"],
  ["manifest/", "manifest"],
  ["analysis/", "analysis"],
  ["runtime/", "runtime"],
  // runner/ is the run command's child process entry: it orchestrates like a command.
  ["runner/", "cli"],
  ["demo/", "demo"], ["ui/", "demo"],
  ["live/", "live"], ["session/", "live"], ["auto-session", "live"], ["traverse/", "live"],
  ["cli/", "cli"], ["cli.ts", "cli"], ["commands/", "cli"],
  ["index.ts", "public"],
];
const MAY_IMPORT = {
  core: ["core"],
  manifest: ["core", "manifest"],
  analysis: ["core", "manifest", "analysis"],
  runtime: ["core", "runtime"],
  demo: ["core", "runtime", "demo"],
  live: ["core", "manifest", "analysis", "runtime", "demo", "live"],
  cli: null,
  public: null,
};
const layerOf = (rel) => (LAYER_OF.find(([prefix]) => rel === prefix || rel.startsWith(prefix)) ?? [null, "unassigned"])[1];
const ANY_IMPORT_RE = /(?:^\s*(?:import|export)\s[^;]*?from\s+|\bimport\()["'](\.[^"']+)["']/gm;
const violations = [];
for (const f of files) {
  const rel = relative(srcDir, f).replace(/\\/g, "/");
  const from = layerOf(rel);
  if (from === "unassigned") problems.push(`${rel}: not assigned to a layer (add it to LAYER_OF in scripts/check-structure.mjs)`);
  const allowed = MAY_IMPORT[from];
  if (!allowed) continue;
  for (const m of readFileSync(f, "utf8").matchAll(ANY_IMPORT_RE)) {
    const target = relative(srcDir, resolve(dirname(f), m[1])).replace(/\\/g, "/").replace(/\.js$/, ".ts");
    const to = layerOf(target);
    if (to !== "unassigned" && !allowed.includes(to)) violations.push(`${rel} -> ${target}`);
  }
}
const debtFile = join(root, "scripts", "layer-debt.json");
const debt = new Set(JSON.parse(readFileSync(debtFile, "utf8")));
for (const v of violations) if (!debt.has(v)) problems.push(`layer: ${v} (a ${v.split(" -> ").map((x) => layerOf(x)).join(" layer may not import the ")} layer)`);
for (const d of debt) if (!violations.includes(d)) problems.push(`layer debt fixed, remove it from scripts/layer-debt.json: ${d}`);

if (problems.length) {
  console.error("check:structure failed:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`check:structure ok (${files.length} files, no cycles, ${Object.keys(RATCHET).length} ratcheted, ${debt.size} layer violations left)`);
