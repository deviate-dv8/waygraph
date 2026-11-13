// Writing a selector into a page's `_sel.ts`: `waygraph gen method` adds a "TODO" for the Method's button, a live session's `register`
// adds the selector a person picked in the browser.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Node, Project } from "ts-morph";
import type { ObjectLiteralExpression } from "ts-morph";

/** `text` as the last property of `obj`, on its own line, indented as the properties are: returns the file's new text. */
export function withProperty(full: string, obj: ObjectLiteralExpression, text: string): string {
  const close = obj.getEnd() - 1;
  let i = close - 1;
  while (/\s/.test(full[i] ?? "")) i--;
  const lineStart = full.lastIndexOf("\n", close) + 1;
  const closeIndent = /^\s*/.exec(full.slice(lineStart, close))?.[0] ?? "";
  const comma = full[i] === "," || full[i] === "{" ? "" : ",";
  return `${full.slice(0, i + 1)}${comma}\n${closeIndent}  ${text},\n${closeIndent}${full.slice(close)}`;
}

/** Adds `key: <value>` to the selector object `selName` of `file`, when it isn't there. */
export function addSelector(project: Project, file: string, selName: string, key: string, value: string): boolean {
  if (!existsSync(file)) return false;
  const sf = project.createSourceFile(file, readFileSync(file, "utf8"), { overwrite: true });
  let init = sf.getVariableDeclaration(selName)?.getInitializer();
  while (Node.isAsExpression(init) || Node.isSatisfiesExpression(init)) init = init.getExpression();
  if (!Node.isObjectLiteralExpression(init) || init.getProperty(key)) return false;
  writeFileSync(file, withProperty(sf.getFullText(), init, `${key}: ${JSON.stringify(value)}`));
  return true;
}

