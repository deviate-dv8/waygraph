// `waygraph types [project]`: the names of the project's pages, for `to:` and `covers:` to complete and check. Written to
// `src/waygraph-pages.d.ts` as a global `WaygraphPages` interface (the way a framework types its routes); `waygraph
// typecheck` and `check` rewrite it first, so it follows the project without a step of its own.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { buildManifest } from "../../manifest/manifest.js";

const FILE = ["src", "waygraph-pages.d.ts"] as const;

/** The declaration file for `pages`: one key per page name. */
export function pageTypesFile(pages: readonly string[]): string {
  const names = [...new Set(pages)].filter((p) => p !== "*" && p !== "__start__").sort();
  return `// Written by \`waygraph types\`: the names of this project's pages (what \`to\` and \`covers\` take). Don't edit.
export {};
declare global {
  interface WaygraphPages {
${names.map((n) => `    ${JSON.stringify(n)}: true;`).join("\n")}
  }
}
`;
}

/** Writes the project's page names, when they changed; returns whether it did. */
export async function writePageTypes(projectDir: string): Promise<boolean> {
  const manifest = await buildManifest(projectDir);
  // A file that didn't load has pages we can't see: a partial list would make their names errors.
  if (manifest.skipped.length) {
    console.warn(`waygraph types: ${manifest.skipped.length} file(s) didn't load, so the page names are left as they were`);
    return false;
  }
  const text = pageTypesFile(manifest.checkpoints);
  const file = join(projectDir, ...FILE);
  if (existsSync(file) && readFileSync(file, "utf8") === text) return false;
  mkdirSync(join(projectDir, FILE[0]), { recursive: true });
  writeFileSync(file, text);
  return true;
}

/** `waygraph types [project]`. */
export async function typesCase(args: string[]): Promise<void> {
  const proj = resolve(args[1] ?? process.cwd());
  const changed = await writePageTypes(proj);
  console.log(`waygraph types: ${relative(process.cwd(), join(proj, ...FILE)) || FILE.join("/")} ${changed ? "written" : "is up to date"}`);
}
