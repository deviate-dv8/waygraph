// `waygraph upgrade --codemod mem-stubs`: the fake value a key gives when a run isn't handed one moves onto the key where
// it is declared. `registerMemStub(SaucedemoKeys.credentials, () => ({ ... }))` in a `*.mem-stubs.ts` file becomes
// `keys("saucedemo")<{ ... }>({ credentials: () => ({ ... }) })`; the registration, its import and a file left with
// nothing go. What it can't place (a key that isn't `Namespace.field`, a stub using something declared in its own file)
// is listed and left as it was. Works on the TypeScript AST.
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { CallExpression, ObjectLiteralExpression, SourceFile } from "ts-morph";
import { walkDir } from "../../manifest/scan.js";
import { addImport, importedFrom, loadAliases, parse, pruneImports, resolveImport } from "./codemod-support.js";

/** The `keys("ns")<T>(...)` call a const holds. */
function keysCall(sf: SourceFile, name: string): CallExpression | undefined {
  const init = sf.getVariableDeclaration(name)?.getInitializer();
  if (!Node.isCallExpression(init)) return undefined;
  const inner = init.getExpression();
  return Node.isCallExpression(inner) && inner.getExpression().getText() === "keys" ? init : undefined;
}

/** Runs the codemod over a project's TypeScript (`src/`, `tests/`, `config/`). */
export function codemodMemStubs(dir: string): { changed: string[]; problems: string[] } {
  loadAliases(dir);
  const project = new Project({ useInMemoryFileSystem: true });
  const files = walkDir(dir, /\.ts$/).filter((f) => !f.includes("node_modules") && !f.endsWith(".d.ts"));
  const sfs = new Map(files.map((f) => [f, parse(project, f)] as const));
  const js = [...sfs.values()].some((sf) => sf.getImportDeclarations().some((i) => i.getModuleSpecifierValue().endsWith(".js")));
  const problems: string[] = [];
  const touched = new Set<string>();
  const emptied = new Set<string>();
  const shown = (f: string) => relative(dir, f);

  for (const [file, sf] of sfs) {
    for (const statement of sf.getStatements()) {
      if (!Node.isExpressionStatement(statement)) continue;
      const call = statement.getExpression();
      if (!Node.isCallExpression(call) || call.getExpression().getText() !== "registerMemStub") continue;
      const [key, stub] = call.getArguments();
      if (!Node.isPropertyAccessExpression(key) || !Node.isIdentifier(key.getExpression()) || !stub) {
        problems.push(`${shown(file)}: ${call.getText().slice(0, 70)}: not Namespace.field: put it on the key by hand`);
        continue;
      }
      const owner = key.getExpression().getText();
      const origin = importedFrom(sf, owner);
      const keysFile = origin?.file ?? file;
      const target = sfs.get(keysFile);
      const declared = target && keysCall(target, origin?.name ?? owner);
      if (!target || !declared) {
        problems.push(`${shown(file)}: ${owner} isn't a keys() namespace in the project: put the stub on its key by hand`);
        continue;
      }
      const stubText = stub.getText();
      // What the stub uses must come from imports, so it can go to the keys' file.
      const names = new Set(stub.getDescendantsOfKind(SyntaxKind.Identifier).map((id) => id.getText()));
      // A helper the stub uses, declared in the stubs file (not exported), goes with it to the keys' file.
      const isHelper = (st: Node) => (Node.isVariableStatement(st) && !st.isExported() && st.getDeclarations().some((d) => names.has(d.getName()))) || (Node.isFunctionDeclaration(st) && !st.isExported() && names.has(st.getName() ?? ""));
      let helpers = sf.getStatements().filter(isHelper);
      // What a helper uses is a helper too, until nothing new is found.
      for (let size = -1; size !== helpers.length; ) {
        size = helpers.length;
        for (const helper of helpers) for (const id of helper.getDescendantsOfKind(SyntaxKind.Identifier)) names.add(id.getText());
        helpers = sf.getStatements().filter(isHelper);
      }
      for (const helper of helpers) {
        const helperNames = Node.isVariableStatement(helper) ? helper.getDeclarations().map((d) => d.getName()) : [(helper as import("ts-morph").FunctionDeclaration).getName() ?? ""];
        const exists = helperNames.some((n) => target.getVariableDeclaration(n) || target.getFunction(n));
        if (!exists) target.insertStatements(declared.getFirstAncestorByKind(SyntaxKind.VariableStatement)?.getChildIndex() ?? 0, `${helper.getText()}\n`);
      }
      for (const imp of sf.getImportDeclarations()) {
        const from = resolveImport(file, imp.getModuleSpecifierValue());
        for (const n of imp.getNamedImports()) {
          const alias = n.getAliasNode()?.getText();
          const name = alias ?? n.getName();
          if (!names.has(name) || target.getImportDeclarations().some((i) => i.getNamedImports().some((m) => (m.getAliasNode()?.getText() ?? m.getName()) === name))) continue;
          if (from) addImport(target, n.getName(), from, js, alias);
          else target.addImportDeclaration({ moduleSpecifier: imp.getModuleSpecifierValue(), namedImports: [alias ? { name: n.getName(), alias } : n.getName()] });
        }
      }
      const arg = declared.getArguments()[0];
      const field = key.getName();
      if (arg && !Node.isObjectLiteralExpression(arg)) {
        problems.push(`${shown(keysFile)}: ${owner}'s stubs aren't an object literal: add ${field} by hand`);
        continue;
      }
      if (arg && (arg as ObjectLiteralExpression).getProperty(field)) {
        problems.push(`${shown(keysFile)}: ${owner}.${field} already has a stub`);
        continue;
      }
      if (arg) (arg as ObjectLiteralExpression).addPropertyAssignment({ name: field, initializer: stubText });
      else declared.addArgument(`{ ${field}: ${stubText} }`);
      (arg ?? declared.getArguments()[0])?.formatText();
      statement.remove();
      // The helpers nothing uses any more go, the ones the others used last.
      for (let again = true; again; ) {
        again = false;
        for (const helper of helpers) {
          if (helper.wasForgotten()) continue;
          const ids = Node.isVariableStatement(helper) ? helper.getDeclarations().map((d) => d.getName()) : [(helper as import("ts-morph").FunctionDeclaration).getName() ?? ""];
          const still = sf.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => ids.includes(id.getText()) && !helper.containsRange(id.getStart(), id.getEnd()));
          if (!still) {
            helper.remove();
            again = true;
          }
        }
      }
      touched.add(file);
      touched.add(keysFile);
    }
  }

  for (const file of touched) pruneImports(sfs.get(file) as SourceFile);
  const changed: string[] = [];
  for (const file of touched) {
    const sf = sfs.get(file) as SourceFile;
    if (sf.getStatements().every((s) => Node.isImportDeclaration(s))) emptied.add(file);
  }
  // A file left with nothing goes, and so does an import of it for its side effect.
  for (const file of emptied) {
    for (const [other, osf] of sfs) {
      for (const imp of osf.getImportDeclarations()) {
        if (resolveImport(other, imp.getModuleSpecifierValue()) === file && !imp.getNamedImports().length && !imp.getDefaultImport() && !imp.getNamespaceImport()) {
          imp.remove();
          touched.add(other);
        }
      }
    }
  }
  for (const file of touched) {
    const sf = sfs.get(file) as SourceFile;
    if (emptied.has(file) && existsSync(file)) {
      const stillImported = [...sfs].some(([other, osf]) => other !== file && !emptied.has(other) && osf.getImportDeclarations().some((i) => resolveImport(other, i.getModuleSpecifierValue()) === file));
      if (!stillImported) {
        unlinkSync(file);
        changed.push(`${shown(file)} (removed)`);
        continue;
      }
    }
    writeFileSync(file, sf.getFullText());
    changed.push(shown(file));
  }
  return { changed, problems };
}
