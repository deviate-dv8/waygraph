// `waygraph upgrade --codemod stub`: a Block's `.stubAfter(fn)` is `.stub(fn)`. Narration after the step lands is the common
// one, so it has the short name; `.stubBefore` and `.stubOnError` stay. Works on the TypeScript AST (property calls only).
import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import { indentationOf } from "../../manifest/source.js";
import { walkDir } from "../../manifest/scan.js";

/** Renames each `.stubAfter(` call in `text`; returns the text and how many it changed. */
export function convertStub(text: string): { text: string; changed: number } {
  const project = new Project({ useInMemoryFileSystem: true, manipulationSettings: { indentationText: indentationOf(text) } });
  const sf = project.createSourceFile("/file.ts", text, { overwrite: true });
  let changed = 0;
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (Node.isPropertyAccessExpression(callee) && callee.getName() === "stubAfter") {
      callee.getNameNode().replaceWithText("stub");
      changed += 1;
    }
  }
  return { text: sf.getFullText(), changed };
}

/** Runs the codemod over a project's TypeScript. */
export function codemodStub(dir: string): { changed: string[]; problems: string[] } {
  const changed: string[] = [];
  for (const file of walkDir(dir, /\.ts$/).filter((f) => !f.includes("node_modules") && !f.endsWith(".d.ts"))) {
    const before = readFileSync(file, "utf8");
    if (!before.includes(".stubAfter(")) continue;
    const after = convertStub(before);
    if (after.changed) {
      writeFileSync(file, after.text);
      changed.push(relative(dir, file));
    }
  }
  return { changed, problems: [] };
}
