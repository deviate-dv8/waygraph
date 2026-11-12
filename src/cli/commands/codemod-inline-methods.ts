// `waygraph upgrade --codemod inline-methods`: a page's Methods are written in the page. A Method in its own file that only
// its page uses (`do: () => ({ fillEmail: FillEmailBlock })`, the Method `from` that page) becomes
// `do: (page) => ({ fillEmail: page.method({ name, act, verify, ... }) })`; the Method keeps its name, so run logs and
// the manifest don't change. `from` goes (the page is it), a `to` on the same page goes, and another page's Checkpoint
// becomes its name (`to: "Dashboard"`). The file goes with it. A Method shared with another file, one that starts on another
// page, or one with a helper this can't move is listed and left in its file. Works on the TypeScript AST.
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { ArrowFunction, ObjectLiteralExpression, SourceFile } from "ts-morph";
import { walkDir } from "../../manifest/scan.js";
import { addImport, importedFrom, loadAliases, parse, propertyOf, pruneImports, resolveImport } from "./codemod-support.js";

/** The tag a Checkpoint identifier stands for: `const Login = checkpoint("Login")` -> `Login`; a name used as is when unknown. */
function tagOf(sfs: ReadonlyMap<string, SourceFile>, from: SourceFile, name: string): string {
  const origin = importedFrom(from, name);
  const sf = origin ? sfs.get(origin.file) : from;
  const init = sf?.getVariableDeclaration(origin?.name ?? name)?.getInitializer();
  if (Node.isCallExpression(init) && init.getExpression().getText() === "checkpoint") {
    const arg = init.getArguments()[0];
    if (Node.isStringLiteral(arg)) return arg.getLiteralValue();
  }
  return name;
}

/** The Checkpoint(s) of a `from`/`to` value as source text: one identifier, or an array of them. */
function checkpointsOf(node: Node | undefined): string[] | undefined {
  if (!node) return [];
  if (Node.isIdentifier(node)) return [node.getText()];
  if (Node.isArrayLiteralExpression(node) && node.getElements().every((e) => Node.isIdentifier(e))) return node.getElements().map((e) => e.getText());
  return undefined;
}

/** Runs the codemod over a project's TypeScript (`src/`, `tests/`, `config/`). */
export function codemodInlineMethods(dir: string): { changed: string[]; problems: string[] } {
  loadAliases(dir);
  const project = new Project({ useInMemoryFileSystem: true });
  const files = walkDir(dir, /\.ts$/).filter((f) => !f.includes("node_modules") && !f.endsWith(".d.ts"));
  const sfs = new Map(files.map((f) => [f, parse(project, f)] as const));
  const js = [...sfs.values()].some((sf) => sf.getImportDeclarations().some((i) => i.getModuleSpecifierValue().endsWith(".js")));
  const problems: string[] = [];
  const touched = new Set<string>();
  const removed = new Set<string>();
  const shown = (f: string) => relative(dir, f);

  /** Files (other than `except`, and the removed) that name `name` from `file`. */
  const usersOf = (file: string, name: string, except: string): string[] =>
    [...sfs]
      .filter(([other, osf]) => other !== except && other !== file && !removed.has(other) && osf.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => !id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) && id.getText() === name && importedFrom(osf, name)?.file === file))
      .map(([other]) => other);

  for (const [pageFile, psf] of sfs) {
    for (const decl of psf.getVariableDeclarations()) {
      const call = decl.getInitializer();
      if (!Node.isCallExpression(call) || call.getExpression().getText() !== "definePageBlock") continue;
      const options = call.getArguments()[0];
      if (!Node.isObjectLiteralExpression(options)) continue;
      const checkpointText = propertyOf(options, "checkpoint")?.getText();
      const doProp = options.getProperty("do");
      const arrow = Node.isPropertyAssignment(doProp) ? doProp.getInitializer() : undefined;
      if (!Node.isArrowFunction(arrow) || !checkpointText) continue;
      let record: Node | undefined = arrow.getBody();
      while (Node.isParenthesizedExpression(record)) record = record.getExpression();
      if (!Node.isObjectLiteralExpression(record)) continue;
      // The page's own tag, to know `to` is the page itself.
      const pageTag = /^["']/.test(checkpointText) ? checkpointText.slice(1, -1) : tagOf(sfs, psf, checkpointText);
      const entries: string[] = [];
      let converted = 0;
      for (const prop of record.getProperties()) {
        const keep = () => entries.push(prop.getText());
        if (!Node.isPropertyAssignment(prop) || !Node.isIdentifier(prop.getInitializer())) {
          keep();
          continue;
        }
        const ident = prop.getInitializer()!.getText();
        const origin = importedFrom(psf, ident);
        const msf = origin ? sfs.get(origin.file) : undefined;
        const where = `${shown(pageFile)}: ${prop.getName()}`;
        if (!origin || !msf) {
          keep();
          continue;
        }
        const method = msf.getVariableDeclaration(origin.name);
        const mcall = method?.getInitializer();
        if (!Node.isCallExpression(mcall) || mcall.getExpression().getText() !== "defineMethodBlock" || !Node.isObjectLiteralExpression(mcall.getArguments()[0])) {
          keep();
          continue;
        }
        const mo = mcall.getArguments()[0] as ObjectLiteralExpression;
        if (mo.getProperty("instruction")) {
          problems.push(`${where}: ${origin.name} still has an instruction: run --codemod instructions first`);
          keep();
          continue;
        }
        const from = checkpointsOf(mo.getProperty("from") && Node.isPropertyAssignment(mo.getProperty("from")) ? (mo.getProperty("from") as import("ts-morph").PropertyAssignment).getInitializer() : undefined);
        const to = checkpointsOf(mo.getProperty("to") && Node.isPropertyAssignment(mo.getProperty("to")) ? (mo.getProperty("to") as import("ts-morph").PropertyAssignment).getInitializer() : undefined);
        if (!from || !to || from.length !== 1 || tagOf(sfs, msf, from[0] as string) !== pageTag) {
          problems.push(`${where}: ${origin.name} doesn't start on this page: left in its file`);
          keep();
          continue;
        }
        if (usersOf(origin.file, origin.name, pageFile).length || msf.getExportedDeclarations().size > 1) {
          problems.push(`${where}: ${origin.name} is used elsewhere, or its file has more than the Method: left in its file`);
          keep();
          continue;
        }
        // What the Method uses, besides the page's own imports: moved into the page's file with it.
        const names = new Set(mo.getDescendantsOfKind(SyntaxKind.Identifier).map((id) => id.getText()));
        const isHelper = (st: Node) =>
          (Node.isVariableStatement(st) && !st.isExported() && st.getDeclarations().some((d) => names.has(d.getName()))) || (Node.isFunctionDeclaration(st) && !st.isExported() && names.has(st.getName() ?? ""));
        let helpers = msf.getStatements().filter(isHelper);
        for (let size = -1; size !== helpers.length; ) {
          size = helpers.length;
          for (const h of helpers) for (const id of h.getDescendantsOfKind(SyntaxKind.Identifier)) names.add(id.getText());
          helpers = msf.getStatements().filter(isHelper);
        }
        for (const h of helpers) {
          const own = Node.isVariableStatement(h) ? h.getDeclarations().map((d) => d.getName()) : [(h as import("ts-morph").FunctionDeclaration).getName() ?? ""];
          if (!own.some((n) => psf.getVariableDeclaration(n) || psf.getFunction(n))) psf.insertStatements(decl.getVariableStatementOrThrow().getChildIndex(), `${h.getText()}\n`);
        }
        for (const imp of msf.getImportDeclarations()) {
          const target = resolveImport(origin.file, imp.getModuleSpecifierValue());
          for (const n of imp.getNamedImports()) {
            const alias = n.getAliasNode()?.getText();
            const local = alias ?? n.getName();
            if (!names.has(local) || psf.getImportDeclarations().some((i) => i.getNamedImports().some((m) => (m.getAliasNode()?.getText() ?? m.getName()) === local))) continue;
            if (target) addImport(psf, n.getName(), target, js, alias);
            else psf.addImportDeclaration({ moduleSpecifier: imp.getModuleSpecifierValue(), namedImports: [alias ? { name: n.getName(), alias } : n.getName()] });
          }
        }
        // The Method as `page.method({ ... })`: its own members, without from; `to` as names unless it's the page.
        const members = mo
          .getProperties()
          .filter((m) => !(Node.isPropertyAssignment(m) && ["from", "to"].includes(m.getName())))
          .map((m) => m.getText());
        const lands = to.map((t) => tagOf(sfs, msf, t));
        if (!(lands.length === 1 && lands[0] === pageTag)) members.unshift(`to: ${lands.length === 1 ? JSON.stringify(lands[0]) : `[${lands.map((l) => JSON.stringify(l)).join(", ")}]`}`);
        entries.push(`${prop.getName()}: page.method({\n${members.join(",\n")},\n})`);
        converted += 1;
        removed.add(origin.file);
        touched.add(origin.file);
        for (const h of helpers) h.remove();
        method?.getVariableStatement()?.remove();
      }
      if (converted === 0) continue;
      const params = arrow.getParameters();
      const asFunction = arrow as ArrowFunction;
      if (!params.length) asFunction.addParameter({ name: "page" });
      record.replaceWithText(`{\n${entries.join(",\n")},\n}`);
      // The record sits in parentheses in `() => ({ ... })`; replacing the object keeps them.
      touched.add(pageFile);
    }
  }

  const changed: string[] = [];
  for (const file of touched) pruneImports(sfs.get(file) as SourceFile);
  for (const file of touched) {
    const sf = sfs.get(file) as SourceFile;
    if (removed.has(file) && sf.getStatements().every((s) => Node.isImportDeclaration(s)) && existsSync(file)) {
      unlinkSync(file);
      changed.push(`${shown(file)} (removed)`);
      continue;
    }
    writeFileSync(file, sf.getFullText());
    changed.push(shown(file));
  }
  return { changed, problems };
}
