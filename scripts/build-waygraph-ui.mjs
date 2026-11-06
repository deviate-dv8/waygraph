#!/usr/bin/env node
// Builds Waygraph UI (ui/) into dist/ui, the app `waygraph ui` starts: the compiled server, its views and the bundled
// browser assets. Its runtime packages are waygraph's own dependencies, so dist/ui ships no node_modules; its
// package.json keeps only what Node needs to load it (ESM, the #imports).
// Part of npm run build; needs ui/ installed once (npm ci --prefix ui).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ui = join(root, "ui");
const out = join(root, "dist", "ui");

if (!existsSync(join(ui, "node_modules"))) {
  console.error("build-waygraph-ui: ui/ isn't installed - run npm ci --prefix ui");
  process.exit(1);
}
const build = spawnSync("npm", ["run", "build"], { cwd: ui, encoding: "utf8" });
if (build.status !== 0) {
  process.stderr.write(build.stdout + build.stderr);
  console.error("build-waygraph-ui: the UI's build failed");
  process.exit(1);
}

// What only development and the UI's own tests use.
const DEV_ONLY = new Set(["package-lock.json", "tests", "ace.js", "vite.config.js", "test.js", "console.js"]);
rmSync(out, { recursive: true, force: true });
cpSync(join(ui, "build"), out, {
  recursive: true,
  filter: (src) => !DEV_ONLY.has(basename(src)) && !src.endsWith(".map"),
});
const pkg = JSON.parse(readFileSync(join(ui, "build", "package.json"), "utf8"));
writeFileSync(
  join(out, "package.json"),
  JSON.stringify({ name: "waygraph-ui", private: true, type: pkg.type, imports: pkg.imports }, null, 2) + "\n",
);
console.log(`build-waygraph-ui: ${out}`);
