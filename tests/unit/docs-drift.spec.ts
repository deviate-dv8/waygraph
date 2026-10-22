import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Docs, skills and the scaffold must not teach what the source marks `@deprecated`. The deprecated names are read from the
 * source, so tagging a function adds it to this check automatically; a line may still mention one when it says it is
 * deprecated / replaced.
 */
const root = join(import.meta.dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (["node_modules", "dist", ".vitepress", "api", ".git"].includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function deprecatedFunctions(): string[] {
  const names = new Set<string>();
  for (const file of walk(join(root, "src")).filter((f) => f.endsWith(".ts"))) {
    const text = readFileSync(file, "utf8");
    const re = /\/\*\*(?:(?!\*\/)[\s\S])*?@deprecated(?:(?!\*\/)[\s\S])*?\*\/\s*\nexport (?:async )?(?:function|const) ([A-Za-z_$][\w$]*)/g;
    for (const m of text.matchAll(re)) names.add(m[1]!);
  }
  // overload-style and method deprecations in Engine
  names.add("defineFlow");
  return [...names].filter((n) => /^[a-z]/.test(n) && n.length > 4);
}

const TAUGHT = [
  ...walk(join(root, "docs")).filter((f) => f.endsWith(".md") && !f.endsWith("deprecated.md") && !f.includes("/public/")),
  ...walk(join(root, "templates/skills")),
  ...walk(join(root, "templates/scaffold")).filter((f) => /\.(md|ts)$/.test(f)),
  ...walk(join(root, "templates/quickstart")).filter((f) => /\.(md|ts)$/.test(f)),
  ...walk(join(root, "examples")).filter((f) => /\.(md|ts)$/.test(f)),
  join(root, "README.md"),
];
const EXCUSE = /deprecat|replac|instead|no more|never|not |old |legacy|still work|older|was |used to|migrat|\bnot\b|\bno\b/i;

describe("docs, skills and the scaffold do not teach deprecated API", () => {
  const names = deprecatedFunctions();
  it("finds the deprecated functions in the source", () => {
    for (const n of ["withTitle", "withMemStub", "chainFlow", "defineFlow", "withBlockPace"]) assert.ok(names.includes(n), n);
  });

  it("no taught file calls one without saying it is deprecated", () => {
    const offenders: string[] = [];
    for (const file of TAUGHT) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const n of names) {
          if (new RegExp(`\\b${n}\\(`).test(line) && !EXCUSE.test(line)) {
            offenders.push(`${relative(root, file)}:${i + 1}  ${n}(`);
          }
        }
      });
    }
    assert.deepEqual(offenders, [], `taught deprecated API:\n${offenders.join("\n")}`);
  });
});
