#!/usr/bin/env node
// Links this checkout into each example as its `waygraph` dependency (examples/<name>/node_modules/waygraph -> the
// repo), so the examples and the specs that scan them import the package being developed. Only the link: installing
// an example would give it its own Playwright, and two copies of Playwright in one run is a hard error.
// Run: npm run examples:link (after npm run build). Idempotent.
import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const example of ["saucedemo", "routed-demo"]) {
  const modules = join(root, "examples", example, "node_modules");
  const link = join(modules, "waygraph");
  const target = relative(modules, root);
  mkdirSync(modules, { recursive: true });
  if (existsSync(link) || lstatSync(link, { throwIfNoEntry: false })) {
    if (lstatSync(link).isSymbolicLink() && resolve(modules, readlinkSync(link)) === root) continue;
    rmSync(link, { recursive: true, force: true });
  }
  symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
  console.log(`linked examples/${example}/node_modules/waygraph -> ${target}`);
}
