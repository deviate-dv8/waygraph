// What the codemods that rewrite a project's pages share: a file parsed in its own indentation, imports resolved the way
// the project writes them (relative, or a package.json "imports" alias like `#map/*`), the import graph, and imports
// added and pruned.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Node, SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type { ObjectLiteralExpression, SourceFile } from "ts-morph";
import { indentationOf } from "../../manifest/source.js";
import { resolveImport as resolveRelative } from "./codemod-keys.js";

export function parse(project: Project, file: string): SourceFile {
  const text = readFileSync(file, "utf8");
  project.manipulationSettings.set({ indentationText: indentationOf(text) });
  return project.createSourceFile(file, text, { overwrite: true });
}

/** The project's `package.json` "imports" (`#map/*` -> `./src/map/*.ts`), as prefix and folder. */
let aliases: { prefix: string; folder: string }[] = [];

export function loadAliases(dir: string): void {
  aliases = [];
  const pkg = join(dir, "package.json");
  if (!existsSync(pkg)) return;
  const imports = (JSON.parse(readFileSync(pkg, "utf8")) as { imports?: Record<string, string> }).imports ?? {};
  for (const [key, target] of Object.entries(imports)) {
    if (key.endsWith("/*") && typeof target === "string" && target.endsWith("*.ts")) aliases.push({ prefix: key.slice(0, -1), folder: resolve(dir, target.slice(0, -4)) });
  }
}

/** The project file an import specifier points at: relative, or through an "imports" alias. */
export function resolveImport(from: string, spec: string): string | undefined {
  const alias = aliases.find((a) => spec.startsWith(a.prefix));
  if (alias) {
    const file = join(alias.folder, spec.slice(alias.prefix.length)) + ".ts";
    return existsSync(file) ? file : undefined;
  }
  return resolveRelative(from, spec);
}

/** An import specifier for `to` from `from`: an alias where the file's other imports use them, else relative. */
export function specifierFor(from: string, to: string, js: boolean, aliased: boolean): string {
  const alias = aliased ? aliases.find((a) => to.startsWith(a.folder + "/")) : undefined;
  if (alias) return alias.prefix + to.slice(alias.folder.length + 1).replace(/\.ts$/, "");
  const spec = relative(dirname(from), to).replace(/\\/g, "/").replace(/\.ts$/, js ? ".js" : "");
  return spec.startsWith(".") ? spec : "./" + spec;
}


/** The text of a string-literal property or an identifier value of an object literal: `name: "x"`, `from: Cp`. */
export function propertyOf(options: ObjectLiteralExpression, name: string): Node | undefined {
  const prop = options.getProperty(name);
  return Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
}

/** What a name in `sf` is imported from (a project file, and its name there), if it's an import. */
export function importedFrom(sf: SourceFile, name: string): { file: string; name: string } | undefined {
  for (const imp of sf.getImportDeclarations()) {
    const named = imp.getNamedImports().find((n) => (n.getAliasNode()?.getText() ?? n.getName()) === name);
    const file = named ? resolveImport(sf.getFilePath(), imp.getModuleSpecifierValue()) : undefined;
    if (named && file) return { file, name: named.getName() };
  }
  return undefined;
}

/** `text` indented as the body of a property of an object literal indented by `base`. */
export function reindented(text: string, base: string): string {
  const lines = text.split("\n");
  const rest = lines.slice(1).filter((l) => l.trim());
  const common = Math.min(...rest.map((l) => l.length - l.trimStart().length), Infinity);
  return [lines[0], ...lines.slice(1).map((l) => (l.trim() ? base + l.slice(Number.isFinite(common) ? common : 0) : l))].join("\n");
}


/** Files each file imports, among the project's (to tell where a new import would close a cycle). */
export function importGraph(sfs: ReadonlyMap<string, SourceFile>): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const [file, sf] of sfs) {
    graph.set(file, sf.getImportDeclarations().map((i) => resolveImport(file, i.getModuleSpecifierValue())).filter((t): t is string => t !== undefined));
  }
  return graph;
}

export function reaches(graph: ReadonlyMap<string, string[]>, from: string, to: string): boolean {
  const seen = new Set<string>();
  const queue = [from];
  while (queue.length) {
    const at = queue.pop()!;
    if (at === to) return true;
    if (seen.has(at)) continue;
    seen.add(at);
    queue.push(...(graph.get(at) ?? []));
  }
  return false;
}

/** Drops the named imports of `sf` nothing uses any more (and the import, when it names nothing else). */
export function pruneImports(sf: SourceFile): void {
  const used = new Set(
    sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => !id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)).map((id) => id.getText()),
  );
  for (const imp of sf.getImportDeclarations()) {
    const named = imp.getNamedImports();
    // `import {} from "x"`: what it imported is gone.
    if (!named.length) {
      if (!imp.getDefaultImport() && !imp.getNamespaceImport() && /\{\s*\}/.test(imp.getText())) imp.remove();
      continue;
    }
    for (const n of named) if (!used.has(n.getAliasNode()?.getText() ?? n.getName())) n.remove();
    if (!imp.getNamedImports().length && !imp.getDefaultImport() && !imp.getNamespaceImport()) imp.remove();
  }
}

export function addImport(sf: SourceFile, name: string, target: string, js: boolean, alias?: string): void {
  const spec = specifierFor(sf.getFilePath(), target, js, sf.getImportDeclarations().some((i) => i.getModuleSpecifierValue().startsWith("#")));
  const existing = sf.getImportDeclarations().find((i) => resolveImport(sf.getFilePath(), i.getModuleSpecifierValue()) === target);
  if (existing) {
    if (!existing.getNamedImports().some((n) => n.getName() === name && n.getAliasNode()?.getText() === alias)) existing.addNamedImport(alias ? { name, alias } : name);
  } else {
    sf.addImportDeclaration({ moduleSpecifier: spec, namedImports: [alias ? { name, alias } : name] });
  }
}

