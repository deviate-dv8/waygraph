// `waygraph upgrade --codemod extract-methods`: a Method written in its page (`do: (self) => ({ fillEmail: self.method({ ... }) })`)
// becomes a file of its own in the page's `_methods/`: `export const fillEmail = (self: PageHandle<"Login">) => self.method({ ... })`,
// listed in the page's `do` as `fillEmail: fillEmail(self)`. The same shape `waygraph gen` writes, so a page stays small as
// the app grows. A Method that uses the page's own read (`self.read`), a helper declared in the page's file, or takes params
// is left where it is, and listed. Works on the TypeScript AST.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { ObjectLiteralExpression, SourceFile } from "ts-morph";
import { walkDir } from "../../manifest/scan.js";
import { importedFrom, loadAliases, parse, propertyOf, pruneImports } from "./codemod-support.js";

const kebab = (text: string) => text.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/** The tag of a page's Checkpoint: its string, or what `checkpoint("Tag")` the identifier is declared as. */
function tagOf(sfs: ReadonlyMap<string, SourceFile>, sf: SourceFile, node: Node | undefined): string | undefined {
  if (Node.isStringLiteral(node)) return node.getLiteralValue();
  if (!Node.isIdentifier(node)) return undefined;
  const origin = importedFrom(sf, node.getText());
  const decl = (origin ? sfs.get(origin.file) : sf)?.getVariableDeclaration(origin?.name ?? node.getText())?.getInitializer();
  const arg = Node.isCallExpression(decl) && decl.getExpression().getText() === "checkpoint" ? decl.getArguments()[0] : undefined;
  return Node.isStringLiteral(arg) ? arg.getLiteralValue() : undefined;
}

/** `spec` imported from `import` in a file one folder deeper: relative paths gain a `../`. */
const deeper = (spec: string): string => (spec.startsWith("./") ? `.${spec}` : spec.startsWith("../") ? `../${spec}` : spec);

/** Runs the codemod over a project's TypeScript (`src/`, `tests/`, `config/`). */
export function codemodExtractMethods(dir: string): { changed: string[]; problems: string[] } {
  loadAliases(dir);
  const project = new Project({ useInMemoryFileSystem: true });
  const files = walkDir(dir, /\.ts$/).filter((f) => !f.includes("node_modules") && !f.endsWith(".d.ts"));
  const sfs = new Map(files.map((f) => [f, parse(project, f)] as const));
  const ext = [...sfs.values()].some((sf) => sf.getImportDeclarations().some((i) => i.getModuleSpecifierValue().endsWith(".js"))) ? ".js" : "";
  const changed: string[] = [];
  const problems: string[] = [];
  const shown = (f: string) => relative(dir, f);

  for (const [pageFile, psf] of sfs) {
    if (!psf.getFullText().includes("definePageBlock")) continue;
    for (const decl of psf.getVariableDeclarations()) {
      const call = decl.getInitializer();
      if (!Node.isCallExpression(call) || call.getExpression().getText() !== "definePageBlock") continue;
      const options = call.getArguments()[0];
      if (!Node.isObjectLiteralExpression(options)) continue;
      const tag = tagOf(sfs, psf, propertyOf(options, "checkpoint"));
      const doProp = options.getProperty("do");
      const arrow = Node.isPropertyAssignment(doProp) ? doProp.getInitializer() : undefined;
      if (!tag || !Node.isArrowFunction(arrow)) continue;
      const selfName = arrow.getParameters()[0]?.getName();
      let record: Node | undefined = arrow.getBody();
      while (Node.isParenthesizedExpression(record)) record = record.getExpression();
      if (!selfName || !Node.isObjectLiteralExpression(record)) continue;
      const folder = join(dirname(pageFile), "_methods");
      const named = (name: string) => psf.getVariableDeclaration(name) || psf.getFunction(name) || psf.getImportDeclarations().some((i) => i.getNamedImports().some((n) => (n.getAliasNode()?.getText() ?? n.getName()) === name));
      const entries: string[] = [];
      const imports: { name: string; from: string }[] = [];
      let moved = 0;
      for (const prop of (record as ObjectLiteralExpression).getProperties()) {
        const keep = () => entries.push(prop.getText());
        const value = Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
        const key = Node.isPropertyAssignment(prop) ? prop.getName() : "";
        if (!Node.isCallExpression(value) || value.getExpression().getText() !== `${selfName}.method` || !Node.isObjectLiteralExpression(value.getArguments()[0])) {
          keep();
          continue;
        }
        const spec = value.getArguments()[0] as ObjectLiteralExpression;
        const names = new Set(spec.getDescendantsOfKind(SyntaxKind.Identifier).map((id) => id.getText()));
        const file = join(folder, `${kebab(key)}.method.block.ts`);
        const own = psf.getStatements().filter((st) => (Node.isVariableStatement(st) && st.getDeclarations().some((d) => names.has(d.getName()))) || (Node.isFunctionDeclaration(st) && names.has(st.getName() ?? "")) || ((Node.isTypeAliasDeclaration(st) || Node.isInterfaceDeclaration(st)) && names.has(st.getName())));
        const usesSelf = spec.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).some((a) => a.getExpression().getText() === selfName);
        if (own.length || usesSelf || existsSync(file) || named(key)) {
          problems.push(`${shown(pageFile)}: ${key} ${own.length ? "uses something declared in the page's file" : usesSelf ? `uses ${selfName}` : existsSync(file) ? "has a file already" : "clashes with a name in the page"}: left in the page`);
          keep();
          continue;
        }
        // The imports it needs, as they'd be a folder deeper.
        const needs = psf
          .getImportDeclarations()
          .filter((imp) => imp.getNamedImports().some((n) => names.has(n.getAliasNode()?.getText() ?? n.getName())))
          .map((imp) => {
            const kept = imp.getNamedImports().filter((n) => names.has(n.getAliasNode()?.getText() ?? n.getName()));
            return `import { ${kept.map((n) => (n.getAliasNode() ? `${n.getName()} as ${n.getAliasNode()?.getText()}` : n.getName())).join(", ")} } from ${JSON.stringify(deeper(imp.getModuleSpecifierValue()))};`;
          });
        mkdirSync(folder, { recursive: true });
        const made = project.createSourceFile(file, `import type { PageHandle } from "waygraph";\n${needs.join("\n")}\n\nexport const ${key} = (self: PageHandle<${JSON.stringify(tag)}>) =>\n  self.method(${spec.getText()});\n`, { overwrite: true });
        made.formatText({ indentSize: 2, convertTabsToSpaces: true });
        writeFileSync(file, made.getFullText());
        changed.push(shown(file));
        entries.push(`${key}: ${key}(${selfName})`);
        imports.push({ name: key, from: `./_methods/${kebab(key)}.method.block${ext}` });
        moved += 1;
      }
      if (!moved) continue;
      const replaced = (record as ObjectLiteralExpression).replaceWithText(`{\n${entries.map((e) => e.replace(/^\s+/, "")).join(",\n")},\n}`);
      replaced.formatText({ indentSize: 2, convertTabsToSpaces: true });
      for (const { name, from } of imports) psf.addImportDeclaration({ moduleSpecifier: from, namedImports: [name] });
      pruneImports(psf);
      writeFileSync(pageFile, psf.getFullText());
      changed.push(shown(pageFile));
    }
  }
  return { changed, problems };
}
