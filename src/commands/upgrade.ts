import { join, relative, resolve, dirname } from "node:path";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { packageRoot } from "../cli/util.js";

// Filled in per project at init, so they never compare equal to the template.
const SKIP = new Set(["package.json", "playwright.config.ts"]);

function walk(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full, base) : [relative(base, full)];
  });
}

const targetName = (rel: string): string => (rel === "gitignore" ? ".gitignore" : rel);
const major = (v: string): number[] => v.replace(/^[^\d]*/, "").split(".").map((n) => parseInt(n, 10) || 0);
const isOlder = (a: number[], b: number[]): boolean => {
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  return false;
};

/**
 * `waygraph upgrade [project] [paths...] [--apply] [--overwrite] [--diff]`
 * Compares the project with the scaffold shipped in this waygraph. Dry run by default.
 * Only the paths you name are copied, because a real project deliberately drops parts of the demo.
 */
export async function upgradeCase(args: string[]): Promise<void> {
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const positional = args.slice(1).filter((a) => !a.startsWith("--"));
  const first = positional[0];
  const hasProject = first !== undefined && existsSync(join(resolve(first), "package.json"));
  const proj = resolve(hasProject ? first : process.cwd());
  const paths = hasProject ? positional.slice(1) : positional;
  const templateDir = join(packageRoot(), "templates", "scaffold");
  const ownVersion = JSON.parse(readFileSync(join(packageRoot(), "package.json"), "utf-8")).version as string;
  const pkgPath = join(proj, "package.json");
  if (!existsSync(pkgPath)) {
    console.error(`waygraph upgrade: no package.json in ${proj}`);
    process.exit(1);
  }

  const added: string[] = [];
  const differing: string[] = [];
  for (const rel of walk(templateDir)) {
    if (SKIP.has(rel)) continue;
    const dest = join(proj, targetName(rel));
    if (!existsSync(dest)) added.push(rel);
    else if (!readFileSync(dest).equals(readFileSync(join(templateDir, rel)))) differing.push(rel);
  }
  const selected = (rel: string): boolean => paths.some((p) => rel === p || rel.startsWith(p.replace(/\/?$/, "/")));

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const current = pkg.dependencies?.waygraph as string | undefined;
  const depStale = current !== undefined && isOlder(major(current), major(ownVersion));
  console.log(`waygraph upgrade: ${proj} (waygraph ${current ?? "not a dependency"} -> ${ownVersion})`);
  if (depStale) console.log(`  dependency  waygraph ${current} -> ^${ownVersion}`);
  for (const rel of added) console.log(`  new         ${rel}`);
  for (const rel of differing) console.log(`  differs     ${rel}`);
  if (!depStale && added.length === 0 && differing.length === 0) console.log("  up to date");

  if (flags.has("--diff")) {
    for (const rel of differing.filter((r) => paths.length === 0 || selected(r))) {
      spawnSync("diff", ["-u", join(proj, targetName(rel)), join(templateDir, rel)], { stdio: "inherit" });
    }
  }
  if (!flags.has("--apply")) {
    if (added.length + differing.length > 0) {
      console.log("\nDry run. Copy files with: waygraph upgrade <paths...> --apply   (add --overwrite to replace differing files)");
    }
    return;
  }

  if (depStale) {
    pkg.dependencies.waygraph = `^${ownVersion}`;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    console.log("updated package.json - run npm install");
  }
  if (paths.length === 0 && added.length + differing.length > 0) {
    console.log("no paths given, so no files were copied (e.g. waygraph upgrade \"src/map/(external)/hoppscotch\" --apply)");
    return;
  }
  const copy = [...added, ...(flags.has("--overwrite") ? differing : [])].filter(selected);
  for (const rel of copy) {
    const dest = join(proj, targetName(rel));
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(templateDir, rel), dest);
    console.log(`  wrote       ${rel}`);
  }
  if (copy.length === 0 && paths.length > 0) console.log("nothing matched those paths");
}
