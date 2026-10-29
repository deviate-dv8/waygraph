// Reads a TypeScript file's shape (its exports, imports, string arguments) from the AST (ts-morph), for the places that
// need it without importing the file: `list`, `nav`, a flow file's export name, a map group's imports.
import { readFileSync } from "node:fs";
import { IndentationText, Node, Project, SyntaxKind } from "ts-morph";
import type { SourceFile } from "ts-morph";

const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });

/** The file as it is on disk now. */
export function parseSource(file: string): SourceFile {
  return project.createSourceFile(file.replace(/\\/g, "/").replace(/^[A-Za-z]:/, ""), readFileSync(file, "utf8"), { overwrite: true });
}

/** The indentation a file uses (tabs, two or four spaces), so an edit to it keeps its style. */
export function indentationOf(text: string): IndentationText {
  if (/\n\t/.test(text)) return IndentationText.Tab;
  return /\n {4}\S/.test(text) && !/\n {2}\S/.test(text) ? IndentationText.FourSpaces : IndentationText.TwoSpaces;
}

/** Names the file exports: `export const|let|var|function|class X`, and `export { X }`. */
export function exportedNames(sf: SourceFile): string[] {
  const names: string[] = [];
  for (const statement of sf.getStatements()) {
    if (Node.isVariableStatement(statement) && statement.isExported()) names.push(...statement.getDeclarations().map((d) => d.getName()));
    else if ((Node.isFunctionDeclaration(statement) || Node.isClassDeclaration(statement)) && statement.isExported() && statement.getName()) names.push(statement.getName()!);
    else if (Node.isExportDeclaration(statement) && !statement.getModuleSpecifier()) names.push(...statement.getNamedExports().map((e) => e.getAliasNode()?.getText() ?? e.getName()));
  }
  return names;
}

/** Every module the file imports or re-exports from, including dynamic `import("x")`. */
export function importSpecifiers(sf: SourceFile): string[] {
  const specs = [
    ...sf.getImportDeclarations().map((d) => d.getModuleSpecifierValue()),
    ...sf.getExportDeclarations().flatMap((d) => d.getModuleSpecifierValue() ?? []),
  ];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const arg = call.getArguments()[0];
    if (call.getExpression().getKind() === SyntaxKind.ImportKeyword && Node.isStringLiteral(arg)) specs.push(arg.getLiteralValue());
  }
  return specs;
}

/** Names imported from modules whose specifier passes `from`, in source order (the imported name, not an alias). */
export function namedImportsFrom(sf: SourceFile, from: (specifier: string) => boolean): string[] {
  return sf
    .getImportDeclarations()
    .filter((d) => from(d.getModuleSpecifierValue()))
    .flatMap((d) => d.getNamedImports().map((n) => n.getName()));
}

/** The string literal at `argIndex` of every call whose callee text passes `callee`, in source order. */
export function stringArgs(sf: SourceFile, callee: (text: string) => boolean, argIndex = 0): string[] {
  const out: string[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (!callee(call.getExpression().getText())) continue;
    const arg = call.getArguments()[argIndex];
    if (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg)) out.push(arg.getLiteralValue());
  }
  return out;
}

/** A string property of the object literal passed to every matching call: `Trait.url({ pathname: "/x" })` -> "/x". */
export function objectArgProperty(sf: SourceFile, callee: (text: string) => boolean, property: string): string[] {
  const out: string[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (!callee(call.getExpression().getText())) continue;
    const arg = call.getArguments()[0];
    const prop = Node.isObjectLiteralExpression(arg) ? arg.getProperty(property) : undefined;
    const value = Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
    if (Node.isStringLiteral(value) || Node.isNoSubstitutionTemplateLiteral(value)) out.push(value.getLiteralValue());
  }
  return out;
}

/** Every string literal in the file (comments are not strings), with the property name it initializes, if any. */
export function stringLiterals(sf: SourceFile): { value: string; property: string | undefined }[] {
  const out: { value: string; property: string | undefined }[] = [];
  for (const node of [...sf.getDescendantsOfKind(SyntaxKind.StringLiteral), ...sf.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)]) {
    const parent = node.getParent();
    if (Node.isImportDeclaration(parent) || Node.isExportDeclaration(parent)) continue;
    out.push({ value: node.getLiteralValue(), property: Node.isPropertyAssignment(parent) && parent.getInitializer() === node ? parent.getName() : undefined });
  }
  return out;
}

/** The fixed start of every template literal with a substitution: `[data-test=add-${id}]` gives `[data-test=add-`. */
export function templateHeads(sf: SourceFile): string[] {
  return sf.getDescendantsOfKind(SyntaxKind.TemplateExpression).map((t) => t.getHead().getLiteralText());
}

/** Every call in the file (comments and strings are not calls): its callee as written and whether its first argument is a string. */
export function calls(sf: SourceFile): { callee: string; literalFirstArg: boolean }[] {
  return sf.getDescendantsOfKind(SyntaxKind.CallExpression).map((call) => {
    const arg = call.getArguments()[0];
    return { callee: call.getExpression().getText(), literalFirstArg: Node.isStringLiteral(arg) || Node.isTemplateExpression(arg) || Node.isNoSubstitutionTemplateLiteral(arg) };
  });
}
