#!/usr/bin/env node
// Refactor helper: moves src modules and rewrites every relative import that points at them (src, tests, typecheck,
// scripts, root configs). Usage: node scripts/move-modules.mjs old.ts=new.ts [dir/=newdir/ ...]   (paths relative to src/)
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = process.cwd();
const src = join(root, "src");
const pairs = process.argv.slice(2).map((a) => a.split("="));
const scan = ["src", "tests", "typecheck", "scripts", "playwright.config.ts"];

function walk(p, out = []) {
  if (!existsSync(p)) return out;
  if (statSync(p).isDirectory()) {
    for (const n of readdirSync(p)) if (!["node_modules", "dist", "fixtures"].includes(n)) walk(join(p, n), out);
  } else if (/\.(ts|js|mjs|mts)$/.test(p)) out.push(p);
  return out;
}

// old absolute file -> new absolute file
const moves = new Map();
for (const [from, to] of pairs) {
  const a = join(src, from);
  const b = join(src, to);
  if (from.endsWith("/")) for (const f of walk(a)) moves.set(f, join(b, relative(a, f)));
  else {
    moves.set(a, b);
    const dts = a.replace(/\.(ts|js)$/, ".d.ts");
    if (a.endsWith(".js") && existsSync(dts)) moves.set(dts, b.replace(/\.js$/, ".d.ts"));
  }
}
const newPathOf = (f) => moves.get(f) ?? f;

function resolveSpec(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  for (const cand of [base, base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".mts"), base + ".ts", join(base.replace(/\.js$/, ""), "index.ts")]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

const files = scan.flatMap((s) => walk(join(root, s)));
const RE = /((?:from\s+|import\s*\(\s*|import\s+)["'])(\.{1,2}\/[^"']+)(["'])/g;
const rewritten = new Map();
for (const f of files) {
  const text = readFileSync(f, "utf8");
  const out = text.replace(RE, (all, pre, spec, post) => {
    const target = resolveSpec(f, spec);
    if (!target) return all;
    if (!moves.has(target) && !moves.has(f)) return all;
    const newTarget = newPathOf(target);
    let rel = relative(dirname(newPathOf(f)), newTarget).replace(/\\/g, "/");
    if (!rel.startsWith(".")) rel = "./" + rel;
    // keep the original extension style (.js for .ts sources)
    rel = rel.replace(/\.ts$/, spec.endsWith(".ts") ? ".ts" : ".js").replace(/\.mts$/, ".mjs");
    return pre + rel + post;
  });
  if (out !== text) rewritten.set(f, out);
}
for (const [f, text] of rewritten) writeFileSync(f, text);
for (const [a, b] of moves) {
  execFileSync("mkdir", ["-p", dirname(b)]);
  execFileSync("git", ["mv", a, b]);
}
console.log(`moved ${moves.size} files, rewrote imports in ${rewritten.size}`);
