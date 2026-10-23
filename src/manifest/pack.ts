// `waygraph map pack <group>`: compiles one map group with the project's own TypeScript into an installable package
// (JavaScript + types, an index re-exporting everything, and `waygraph.map.json` for the scanner and Waygraph UI).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { findMapGroup, mapGroupImportProblems, mapGroups } from "./maps.js";
import type { MapGroup, MapImportProblem, MapPackageJson } from "./maps.js";
import { MANIFEST_VERSION } from "./manifest.js";
import { scanProject } from "./project.js";
import { walkDir } from "./scan.js";

export interface PackOptions {
  /** Output folder. Default `.waygraph/packages/<group>`. */
  out?: string | undefined;
  /** Package name. Default `waygraph-map-<group>`. */
  name?: string | undefined;
  version?: string | undefined;
}

export type PackResult =
  | { ok: true; name: string; dir: string; group: string; blocks: number }
  | { ok: false; reason: string; problems?: MapImportProblem[] };

function waygraphVersion(): string {
  const pkg = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
  return (JSON.parse(readFileSync(pkg, "utf8")) as { version: string }).version;
}

function compile(projectDir: string, group: MapGroup, out: string): string | undefined {
  let tsc: string;
  try {
    tsc = createRequire(join(projectDir, "package.json")).resolve("typescript/bin/tsc");
  } catch {
    return "TypeScript is not installed in this project (npm i -D typescript)";
  }
  const base = join(projectDir, "tsconfig.json");
  const config = join(out, "tsconfig.pack.json");
  writeFileSync(
    config,
    JSON.stringify(
      {
        ...(existsSync(base) ? { extends: base } : {}),
        compilerOptions: {
          ...(existsSync(base) ? {} : { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, skipLibCheck: true }),
          noEmit: false,
          declaration: true,
          rootDir: group.dir,
          outDir: out,
        },
        include: [join(group.dir, "**", "*.ts")],
        exclude: [],
      },
      null,
      2,
    ),
  );
  const run = spawnSync(process.execPath, [tsc, "-p", config], { cwd: projectDir, encoding: "utf8" });
  rmSync(config, { force: true });
  if (run.status !== 0) return `tsc failed:\n${run.stdout}${run.stderr}`;
  return undefined;
}

/** Packs a map group (by `(external)/hoppscotch` or `hoppscotch`) into an installable package folder. */
export async function packMapGroup(projectDir: string, groupName: string, opts: PackOptions = {}): Promise<PackResult> {
  const group = findMapGroup(projectDir, groupName);
  if (!group) {
    const known = mapGroups(projectDir).map((g) => g.group);
    return {
      ok: false,
      reason: `no map group "${groupName}" (a src/map/ folder with its own _states.ts)${known.length ? `; groups: ${known.join(", ")}` : ""}`,
    };
  }
  const problems = mapGroupImportProblems(group);
  if (problems.length > 0) return { ok: false, reason: `${group.group} imports files outside the group`, problems };

  const slug = group.group.split("/").pop()!.replace(/[()]/g, "");
  const name = opts.name ?? `waygraph-map-${slug}`;
  const out = resolve(projectDir, opts.out ?? join(".waygraph", "packages", slug));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const failed = compile(projectDir, group, out);
  if (failed) return { ok: false, reason: failed };

  const scan = await scanProject(projectDir, { flows: false, maps: false });
  const blocks = scan.blocks.filter((b) => b.absFile.startsWith(group.dir + sep));
  const checkpoints = new Set<string>();
  for (const b of blocks) for (const t of [...b.from, ...b.to]) if (t !== "*") checkpoints.add(t);
  const map: MapPackageJson = {
    version: MANIFEST_VERSION,
    name,
    group: group.group,
    checkpoints: [...checkpoints].sort(),
    blocks: blocks.map((b) => ({
      name: b.name,
      exportName: b.exportName,
      kind: b.kind,
      from: b.from,
      to: b.to,
      requires: b.requires,
      file: relative(group.dir, b.absFile).split(sep).join("/").replace(/\.ts$/, ".js"),
    })),
  };
  writeFileSync(join(out, "waygraph.map.json"), JSON.stringify(map, null, 2) + "\n");

  const modules = walkDir(out, /\.js$/)
    .map((f) => "./" + relative(out, f).split(sep).join("/"))
    .filter((f) => f !== "./index.js")
    .sort();
  const index = modules.map((m) => `export * from "${m}";`).join("\n") + "\n";
  writeFileSync(join(out, "index.js"), index);
  writeFileSync(join(out, "index.d.ts"), index);
  writeFileSync(
    join(out, "package.json"),
    JSON.stringify(
      {
        name,
        version: opts.version ?? "0.1.0",
        description: `waygraph map: ${group.group}`,
        type: "module",
        main: "./index.js",
        types: "./index.d.ts",
        exports: { ".": { types: "./index.d.ts", default: "./index.js" }, "./*": "./*" },
        files: ["**/*.js", "**/*.d.ts", "waygraph.map.json"],
        keywords: ["waygraph", "waygraph-map"],
        peerDependencies: { waygraph: `^${waygraphVersion()}` },
      },
      null,
      2,
    ) + "\n",
  );
  return { ok: true, name, dir: out, group: group.group, blocks: blocks.length };
}
