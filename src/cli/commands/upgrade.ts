import { basename, join, relative, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { packageRoot } from "../util.js";
import { agentSkillFiles } from "./agent-dive-scaffold.js";
import { codemodCheckpoints } from "./codemod-checkpoints.js";
import { codemodFlows } from "./codemod-flows.js";

// Filled in per project at init, so they never compare equal to the template.
const SKIP = new Set(["package.json", join("config", "waygraph.config.ts")]);

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
 * `waygraph upgrade [project] [paths...] [--apply] [--overwrite] [--diff] [--skills]`
 * Compares the project with the scaffold shipped in this waygraph. Dry run by default.
 * Only the paths you name are copied, because a real project deliberately drops parts of the demo.
 */
export async function upgradeCase(args: string[]): Promise<void> {
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const positional = args.slice(1).filter((a) => !a.startsWith("--"));
  if (flags.has("--codemod")) {
    const what = args[args.indexOf("--codemod") + 1];
    const dir = resolve(positional.find((p) => p !== what) ?? process.cwd());
    if (what === "flows") {
      const { changed, problems } = await codemodFlows(dir);
      for (const f of changed) console.log(`  rewrote     ${f}`);
      for (const p of problems) console.log(`  by hand     ${p}`);
      console.log(`waygraph upgrade --codemod flows: ${changed.length} file(s) changed, ${problems.length} left for you; run waygraph typecheck .`);
      if (problems.length) process.exitCode = 1;
      return;
    }
    if (what !== "checkpoints") {
      console.error("waygraph upgrade --codemod: known codemods: checkpoints, flows");
      process.exit(1);
    }
    const { changed, skipped } = codemodCheckpoints(dir);
    for (const f of changed) console.log(`  rewrote     ${f}`);
    for (const s of skipped) console.log(`  left as is  ${s} (not a declared Checkpoint name)`);
    console.log(`waygraph upgrade --codemod checkpoints: ${changed.length} file(s) changed; run waygraph typecheck .`);
    return;
  }
  // --skills: the agent skills are waygraph's own text, never edited by a project, so refresh them in place.
  if (flags.has("--skills")) {
    flags.add("--apply");
    flags.add("--overwrite");
    positional.push(".agents/skills");
  }
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
  // Every shipped file as [path in the project, content]: the scaffold tree plus the agent skills.
  const shipped = new Map<string, Buffer>();
  for (const rel of walk(templateDir)) if (!SKIP.has(rel)) shipped.set(rel, readFileSync(join(templateDir, rel)));
  for (const { rel, text } of agentSkillFiles()) shipped.set(rel, Buffer.from(text));
  for (const [rel, content] of shipped) {
    const dest = join(proj, targetName(rel));
    if (!existsSync(dest)) added.push(rel);
    else if (!readFileSync(dest).equals(content)) differing.push(rel);
  }
  const selected = (rel: string): boolean => paths.some((p) => rel === p || rel.startsWith(p.replace(/\/?$/, "/")));

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const current = pkg.dependencies?.waygraph as string | undefined;
  const depStale = current !== undefined && !current.startsWith("file:") && isOlder(major(current), major(ownVersion));
  console.log(`waygraph upgrade: ${proj} (waygraph ${current ?? "not a dependency"} -> ${ownVersion})`);
  if (depStale) console.log(`  dependency  waygraph ${current} -> ^${ownVersion}`);
  for (const rel of added) console.log(`  new         ${rel}`);
  for (const rel of differing) console.log(`  differs     ${rel}`);
  if (!depStale && added.length === 0 && differing.length === 0) console.log("  up to date");

  const legacy = ["ts", "mts", "js", "mjs", "cjs"].find((e) => existsSync(join(proj, `playwright.config.${e}`)));
  if (legacy) {
    console.log(`  deprecated  playwright.config.${legacy} - move its settings into config/waygraph.config.ts (testDir, webServer, playwright: { ... })`);
  }

  if (flags.has("--diff")) {
    for (const rel of differing.filter((r) => paths.length === 0 || selected(r))) {
      const shippedCopy = join(tmpdir(), `waygraph-upgrade-${process.pid}-${basename(rel)}`);
      writeFileSync(shippedCopy, shipped.get(rel)!);
      spawnSync("diff", ["-u", join(proj, targetName(rel)), shippedCopy], { stdio: "inherit" });
      rmSync(shippedCopy, { force: true });
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
    writeFileSync(dest, shipped.get(rel)!);
    console.log(`  wrote       ${rel}`);
  }
  if (copy.length === 0 && paths.length > 0) console.log("nothing matched those paths");
}
