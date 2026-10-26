#!/usr/bin/env node
/**
 * Structure guard: keeps src/ from re-growing into files nobody (human or agent) can edit safely.
 *   1. Every src/**\/*.ts stays under MAX_LINES, unless listed in RATCHET - a per-file ceiling
 *      that may only go DOWN (lower the number when you shrink a file; never raise it).
 *   2. No circular value imports between src modules (type-only imports are ignored).
 *   3. Layers: each file's layer may only import the layers allowed for it; scripts/layer-debt.json may only shrink.
 *   4. No barrels: only the package entries (src/index.ts, src/beta.ts) re-export; everything else is imported from where it is declared.
 *   5. No HTML strings into the page: overlay elements are built with __wgEl / __wgSet / __wgSvg (demo/overlay/ui/shadow.ts),
 *      so page and author text is always a text node.
 *   6. WAYGRAPH_* variables are read and written only through engine/env.ts (the registry docs/env.md is generated from).
 *   8. `any` only shrinks: each file's count of `any` keywords may not exceed scripts/any-debt.json (lower it when you
 *      type something; a file not listed has none). Counted with TypeScript's own parser.
 *   7. No `.catch(() => {})` in Node code: catch with ignorePageGone / ignoreTimeout (engine/page-gone.ts) or handle it.
 * Run: npm run check:structure
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");
const MAX_LINES = 500;

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
  ["engine/", "engine"],
  ["manifest/", "manifest"],
  ["analysis/", "analysis"],
  ["runtime/", "runtime"],
  // runner/ is the run command's child process entry: it orchestrates like a command.
  ["runner/", "cli"],
  ["demo/", "demo"],
  ["live/", "live"],
  ["cli/", "cli"],
  ["index.ts", "public"],
  ["beta.ts", "public"],
];
const MAY_IMPORT = {
  engine: ["engine"],
  manifest: ["engine", "manifest"],
  analysis: ["engine", "manifest", "analysis"],
  runtime: ["engine", "runtime"],
  demo: ["engine", "runtime", "demo"],
  live: ["engine", "manifest", "analysis", "runtime", "demo", "live"],
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
// --- no barrels ---
const REEXPORT_RE = /^\s*export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+["']/m;
for (const f of files) {
  const rel = relative(srcDir, f).replace(/\\/g, "/");
  if (rel === "index.ts" || rel === "beta.ts") continue;
  const text = readFileSync(f, "utf8");
  // `export { x }` of a name the file imports is a re-export too.
  const imported = new Set([...text.matchAll(/^import\s+(?:type\s+)?\{([^}]*)\}\s+from/gm)].flatMap((m) => m[1].split(",").map((n) => n.trim().split(/\s+as\s+/).pop()).filter(Boolean)));
  const passedOn = [...text.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}\s*;/gm)].flatMap((m) => m[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0])).filter((n) => imported.has(n));
  if (REEXPORT_RE.test(text) || passedOn.length) problems.push(`${rel}: re-exports another module (import from where it is declared; only src/index.ts and src/beta.ts re-export)`);
}
// --- no HTML strings into the page ---
const HTML_SINK_RE = /\.(?:innerHTML|outerHTML)\s*\+?=|\binsertAdjacentHTML\s*\(|\bdocument\.write\s*\(/;
for (const f of files) {
  const rel = relative(srcDir, f).replace(/\\/g, "/");
  const line = readFileSync(f, "utf8").split("\n").findIndex((l) => HTML_SINK_RE.test(l));
  if (line >= 0) problems.push(`${rel}:${line + 1}: writes an HTML string into the page (build it with __wgEl / __wgSet / __wgSvg)`);
}

// --- WAYGRAPH_* only through the registry ---
const ENV_RE = /process\.env(?:\.WAYGRAPH_|\[\s*["'`]WAYGRAPH_)/;
for (const f of files) {
  const rel = relative(srcDir, f).replace(/\\/g, "/");
  if (rel === "engine/env.ts") continue;
  const line = readFileSync(f, "utf8").split("\n").findIndex((l) => ENV_RE.test(l));
  if (line >= 0) problems.push(`${rel}:${line + 1}: reads process.env.WAYGRAPH_* directly (use envString / envFlag / envNumber / setEnv from engine/env.ts)`);
}

// --- no silent catch-alls in Node code ---
// In-page code (demo/overlay/inpage/) runs in the browser, where page-gone.ts doesn't exist. auto-session/ipc.ts keeps its
// request queue going after a failed request; the caller still gets that error from the promise it was handed.
const SWALLOW_RE = /\.catch\(\s*\(\s*\)\s*=>\s*(?:\{\s*\}|undefined)\s*\)/;
const SWALLOW_ALLOWED = new Set(["live/auto-session/ipc.ts"]);
for (const f of files) {
  const rel = relative(srcDir, f).replace(/\\/g, "/");
  if (rel.startsWith("demo/overlay/inpage/") || SWALLOW_ALLOWED.has(rel)) continue;
  const line = readFileSync(f, "utf8").split("\n").findIndex((l) => SWALLOW_RE.test(l));
  if (line >= 0) problems.push(`${rel}:${line + 1}: .catch(() => {}) swallows every error (use ignorePageGone / ignoreTimeout from engine/page-gone.ts)`);
}

// --- `any` only shrinks ---
const anyDebtFile = join(root, "scripts", "any-debt.json");
const anyDebt = JSON.parse(readFileSync(anyDebtFile, "utf8"));
const anyNow = {};
for (const f of files) {
  const rel = relative(srcDir, f).replace(/\\/g, "/");
  let n = 0;
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) n++;
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true));
  if (n > 0) anyNow[rel] = n;
  const allowed = anyDebt[rel] ?? 0;
  if (n > allowed) problems.push(`${rel}: ${n} \`any\` (allowed ${allowed}) - type it; the any-debt only goes down`);
}
if (process.argv.includes("--write-any-debt")) writeFileSync(anyDebtFile, JSON.stringify(anyNow, null, 2) + "\n");
else for (const [rel, allowed] of Object.entries(anyDebt)) {
  if ((anyNow[rel] ?? 0) < allowed) problems.push(`any-debt: ${rel} is down to ${anyNow[rel] ?? 0} - lower it in scripts/any-debt.json (or run with --write-any-debt)`);
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
