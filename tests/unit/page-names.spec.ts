import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pageTypesFile } from "../../src/cli/commands/types.js";

const root = join(import.meta.dirname, "..", "..");

/** `tsc` over a project that has the page names, with `body` as its one source file: its diagnostics. */
function check(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "wg-names-"));
  try {
    writeFileSync(join(dir, "waygraph-pages.d.ts"), pageTypesFile(["Documents", "Templates", "__start__", "*"]));
    writeFileSync(join(dir, "project-pages.ts"), `import { definePageBlock } from "waygraph";\n${body}\n`);
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022", noEmit: true, skipLibCheck: true, exactOptionalPropertyTypes: true, baseUrl: ".", paths: { waygraph: [join(root, "src/index.ts")] }, typeRoots: [join(root, "node_modules/@types")] },
        include: ["*.ts"],
      }),
    );
    const run = spawnSync(join(root, "node_modules/.bin/tsc"), ["-p", dir], { encoding: "utf8" });
    // Only what is said about the project's own file (the waygraph source compiles under its own config).
    return (run.stdout + run.stderr).split("\n").filter((line) => /(^|\/)project-pages\.ts\(/.test(line)).join("\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("page names", () => {
  it("lists the project's pages as keys, without the start or a wildcard", () => {
    const text = pageTypesFile(["Templates", "Documents", "__start__", "*", "Documents"]);
    assert.match(text, /"Documents": true;\n {4}"Templates": true;/);
    assert.doesNotMatch(text, /__start__|\*/);
  });

  it("accepts a page's name in to and covers, and rejects a typo", () => {
    const good = `export const S = definePageBlock({ name: "s", covers: ["Documents"], links: (self) => ({ docs: self.link({ to: "Documents", click: "#d" }) }) });`;
    assert.equal(check(good).trim(), "");
    const typo = `export const S = definePageBlock({ name: "s", covers: "children", links: (self) => ({ docs: self.link({ to: "Documnts", click: "#d" }) }) });`;
    assert.match(check(typo), /Documnts/);
    const typoCovers = `export const S = definePageBlock({ name: "s", covers: ["Templatez"] });`;
    assert.match(check(typoCovers), /Templatez/);
  });
});
