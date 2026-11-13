// `waygraph upgrade --codemod checks`: `Page.read.items.passes((items, mem) => ..., "why")` becomes the page's one check
// primitive, `Page.check("why", ({ items }, mem) => ...)`: the test gets everything the page shows and says true or false.
// A test that isn't a function written in place is called with the field (`(read, mem) => test(read.items, mem)`).
// `Key.is(want)` stays. Works on the TypeScript AST.
import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { CallExpression } from "ts-morph";
import { indentationOf } from "../../manifest/source.js";
import { walkDir } from "../../manifest/scan.js";

/** `Receiver.read.a.b.passes(...)`: the receiver's text and the field path, when the call is one. */
function passesOf(call: CallExpression): { receiver: string; path: string[] } | undefined {
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== "passes") return undefined;
  const path: string[] = [];
  let at: Node = callee.getExpression();
  while (Node.isPropertyAccessExpression(at)) {
    if (at.getName() === "read") return path.length ? { receiver: at.getExpression().getText(), path: path.reverse() } : undefined;
    path.push(at.getName());
    at = at.getExpression();
  }
  return undefined;
}

/** The destructuring of a field path, bound to `name`: `["a", "b"]` as `{ a: { b: name } }` (`{ a }` when `name` is the field). */
const pattern = (path: string[], name: string): string => {
  const last = path[path.length - 1] ?? name;
  const inner = last === name ? last : `${last}: ${name}`;
  return path.slice(0, -1).reduceRight((acc, key) => `${key}: { ${acc} }`, inner);
};

/** The text of `call` rewritten as the page's check. */
function rewritten(call: CallExpression, receiver: string, path: string[]): string {
  const [test, why] = call.getArguments();
  if (!test) return call.getText();
  const text = why?.getText() ?? JSON.stringify(`${path.join(".")} passes`);
  if (Node.isArrowFunction(test) || Node.isFunctionExpression(test)) {
    const [first, ...rest] = test.getParameters();
    const name = first?.getName() ?? path[path.length - 1] ?? "value";
    if (first && /^\w+$/.test(name)) {
      const params = [`{ ${pattern(path, name)} }`, ...rest.map((p) => p.getText())].join(", ");
      const body = test.getBody().getText();
      const head = Node.isArrowFunction(test) ? `(${params}) => ${body}` : `function (${params}) ${body}`;
      return `${receiver}.check(${text}, ${head})`;
    }
  }
  return `${receiver}.check(${text}, (read, mem) => (${test.getText()})(read.${path.join(".")}, mem))`;
}

/** Rewrites the `passes` calls of one file's text; returns it and how many it changed. */
export function convertChecks(text: string): { text: string; changed: number } {
  const project = new Project({ useInMemoryFileSystem: true, manipulationSettings: { indentationText: indentationOf(text) } });
  const sf = project.createSourceFile("/file.ts", text, { overwrite: true });
  const found = sf.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap((call) => {
    const p = passesOf(call);
    return p ? [{ call, ...p }] : [];
  });
  // Innermost first: a test that holds another `passes` is rewritten before the one around it.
  for (const { call, receiver, path } of found.sort((a, b) => b.call.getStart() - a.call.getStart())) call.replaceWithText(rewritten(call, receiver, path));
  return { text: sf.getFullText(), changed: found.length };
}

/** Runs the codemod over a project's TypeScript. */
export function codemodChecks(dir: string): { changed: string[]; problems: string[] } {
  const changed: string[] = [];
  for (const file of walkDir(dir, /\.ts$/).filter((f) => !f.includes("node_modules") && !f.endsWith(".d.ts"))) {
    const before = readFileSync(file, "utf8");
    if (!before.includes(".passes(")) continue;
    const after = convertChecks(before);
    if (after.changed) {
      writeFileSync(file, after.text);
      changed.push(relative(dir, file));
    }
  }
  return { changed, problems: [] };
}
