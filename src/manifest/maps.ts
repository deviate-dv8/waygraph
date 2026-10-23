// Map groups as packages. A group is a `src/map/` folder that owns its Checkpoints (`_states.ts`); it may import only
// `waygraph`, Playwright, `node:` modules and its own files, so it can be packed (`waygraph map pack`) and installed in
// another project, where the scanner finds it by its `waygraph.map.json`.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { walkDir } from "./scan.js";

export interface MapGroup {
  /** Path under `src/map/`, e.g. `(external)/hoppscotch`. */
  group: string;
  dir: string;
}

/** Every packable group: a folder under `src/map/` with its own `_states.ts`. */
export function mapGroups(projectDir: string): MapGroup[] {
  const mapRoot = join(resolve(projectDir), "src", "map");
  if (!existsSync(mapRoot)) return [];
  return walkDir(mapRoot, /^_states\.ts$/)
    .map((f) => dirname(f))
    .map((dir) => ({ group: relative(mapRoot, dir).split(sep).join("/"), dir }))
    .sort((a, b) => a.group.localeCompare(b.group));
}

/** Finds a group by its full path (`(external)/hoppscotch`) or its last folder (`hoppscotch`). */
export function findMapGroup(projectDir: string, name: string): MapGroup | undefined {
  const groups = mapGroups(projectDir);
  return groups.find((g) => g.group === name) ?? groups.find((g) => g.group.split("/").pop() === name);
}

export interface MapImportProblem {
  file: string;
  spec: string;
}

const ALLOWED_BARE = /^(waygraph|@playwright\/test|playwright|playwright-core)(\/.*)?$|^node:/;
const IMPORT_SPEC = /(?:^\s*(?:import|export)\s[^;]*?from\s+|\bimport\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm;

/** Imports in a group that reach outside it (anything but waygraph, Playwright, `node:` and the group's own files). */
export function mapGroupImportProblems(group: MapGroup): MapImportProblem[] {
  const problems: MapImportProblem[] = [];
  for (const file of walkDir(group.dir, /\.ts$/)) {
    for (const m of readFileSync(file, "utf8").matchAll(IMPORT_SPEC)) {
      const spec = m[1]!;
      if (spec.startsWith(".")) {
        const target = resolve(dirname(file), spec);
        if (target === group.dir || target.startsWith(group.dir + sep)) continue;
      } else if (ALLOWED_BARE.test(spec)) continue;
      problems.push({ file, spec });
    }
  }
  return problems;
}

export interface MapPackageJson {
  version: number;
  name: string;
  group: string;
  checkpoints: string[];
  blocks: { name: string; exportName: string; kind: string; from: string[]; to: string[]; requires: string[]; file: string }[];
}

export interface InstalledMapPackage {
  name: string;
  dir: string;
  map: MapPackageJson;
}

/** Map packages the project depends on: dependencies whose root holds a `waygraph.map.json`. */
export function installedMapPackages(projectDir: string): InstalledMapPackage[] {
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(join(projectDir, "package.json"), "utf8"));
  } catch {
    return [];
  }
  const out: InstalledMapPackage[] = [];
  for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).sort()) {
    const dir = join(projectDir, "node_modules", name);
    const file = join(dir, "waygraph.map.json");
    if (!existsSync(file)) continue;
    try {
      out.push({ name, dir, map: JSON.parse(readFileSync(file, "utf8")) as MapPackageJson });
    } catch {
      /* a broken waygraph.map.json is skipped, like a Block file that fails to import */
    }
  }
  return out;
}

/** The compiled Block files of an installed map package. */
export function mapPackageBlockFiles(pkg: InstalledMapPackage): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (name === "node_modules") continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.block\.js$/.test(name)) files.push(p);
    }
  };
  walk(pkg.dir);
  return files.sort();
}
