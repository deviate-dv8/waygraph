// `waygraph upgrade --codemod nav`: a page opens itself. The Nav Block a Page Block names (`nav: NavLoginBlock`, in a
// `_nav.block.ts`) is folded into the page: its `url` or `click`, `from`, `requires` and `verify` become the page's own,
// `Page.nav` becomes `Page` (`map().gotoPage(LoginPage)`), and the Nav and its file go. What it can't place (a Nav that
// lands somewhere else, a page that opens by a Nav a file the page imports uses) is listed and left as it was.
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { ObjectLiteralExpression, SourceFile } from "ts-morph";
import { walkDir } from "../../manifest/scan.js";
import { addImport, importGraph, importedFrom, loadAliases, parse, propertyOf, pruneImports, reaches, resolveImport } from "./codemod-support.js";

interface NavDecl {
  file: string;
  name: string;
  options: ObjectLiteralExpression;
}

interface PageDecl {
  file: string;
  exportName: string;
  options: ObjectLiteralExpression;
}

/** What a Nav gives its page when the page has none of its own. */
const MOVES = ["url", "click", "from", "requires", "instanceOptions"] as const;

const textOf = (options: ObjectLiteralExpression, name: string): string | undefined => {
  const prop = options.getProperty(name);
  return Node.isPropertyAssignment(prop) ? prop.getInitializer()?.getText() : Node.isShorthandPropertyAssignment(prop) ? prop.getName() : Node.isMethodDeclaration(prop) ? prop.getText() : undefined;
};

/** Runs the codemod over a project's TypeScript (`src/`, `tests/`, `config/`). */
export function codemodNav(dir: string): { changed: string[]; problems: string[] } {
  loadAliases(dir);
  const project = new Project({ useInMemoryFileSystem: true });
  const files = walkDir(dir, /\.ts$/).filter((f) => !f.includes("node_modules") && !f.endsWith(".d.ts"));
  const sfs = new Map(files.map((f) => [f, parse(project, f)] as const));
  const js = [...sfs.values()].some((sf) => sf.getImportDeclarations().some((i) => i.getModuleSpecifierValue().endsWith(".js")));
  const problems: string[] = [];
  const shown = (f: string) => relative(dir, f);
  const touched = new Set<string>();

  const navs = new Map<string, NavDecl>();
  const pages: PageDecl[] = [];
  for (const [file, sf] of sfs) {
    for (const decl of sf.getVariableDeclarations()) {
      const init = decl.getInitializer();
      if (!Node.isCallExpression(init)) continue;
      const callee = init.getExpression().getText();
      const options = init.getArguments()[0];
      if (!Node.isObjectLiteralExpression(options)) continue;
      if (callee === "defineNavBlock" || callee === "defineNavClickBlock") navs.set(`${file}#${decl.getName()}`, { file, name: decl.getName(), options });
      if (callee === "definePageBlock") pages.push({ file, exportName: decl.getName(), options });
    }
  }
  const graph = importGraph(sfs);
  const merged = new Map<string, PageDecl>();
  const taken = new Set<NavDecl>();

  // Pages that name their Nav first: they have a claim on it.
  for (const page of [...pages].sort((a, b) => Number(!!b.options.getProperty("nav")) - Number(!!a.options.getProperty("nav")))) {
    const ref = propertyOf(page.options, "nav");
    const psf = sfs.get(page.file) as SourceFile;
    const where = `${shown(page.file)}: ${page.exportName}`;
    // The Nav it names, or the one Nav that lands on its Checkpoint.
    let nav: NavDecl | undefined;
    if (Node.isIdentifier(ref)) {
      const from = importedFrom(psf, ref.getText());
      nav = navs.get(`${from?.file ?? page.file}#${from?.name ?? ref.getText()}`);
      if (!nav) {
        problems.push(`${where} opens by ${ref.getText()}, which isn't a defineNavBlock in the project: fold it into the page by hand`);
        continue;
      }
    } else if (!ref) {
      const cp = textOf(page.options, "checkpoint");
      const same = [...navs.values()].filter((n) => !taken.has(n) && textOf(n.options, "checkpoint") === cp);
      if (same.length !== 1 || page.options.getProperty("url") || page.options.getProperty("click")) continue;
      nav = same[0];
    } else continue;
    if (!nav) continue;
    taken.add(nav);
    if (page.options.getProperty("url") || page.options.getProperty("click")) {
      problems.push(`${where} has a url or click and a nav: drop one by hand`);
      continue;
    }
    if (textOf(nav.options, "checkpoint") !== textOf(page.options, "checkpoint")) {
      problems.push(`${where} opens by ${nav.name}, which lands on another Checkpoint: fold it into the page by hand`);
      continue;
    }
    // Everything that used the Nav now uses the page; a file the page imports can't, while loading.
    const users = [...sfs].filter(([file]) => file !== nav.file && file !== page.file && [...sfs.get(file)!.getDescendantsOfKind(SyntaxKind.Identifier)].some((id) => {
      if (id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)) return false;
      const origin = importedFrom(sfs.get(file)!, id.getText());
      return origin?.file === nav.file && origin.name === nav.name;
    }));
    const blocked = users.find(([file]) => reaches(graph, page.file, file));
    if (blocked) {
      problems.push(`${where}: ${shown(blocked[0])} uses ${nav.name} and is imported by the page, so it can't use the page: fold ${nav.name} in by hand`);
      continue;
    }
    // The Nav's own fields move onto the page.
    const moved: string[] = [];
    for (const name of MOVES) {
      const text = textOf(nav.options, name);
      if (text !== undefined && !page.options.getProperty(name)) moved.push(name === "instanceOptions" ? (nav.options.getProperty(name)?.getText() ?? "") : `${name}: ${text}`);
    }
    const navVerify = nav.options.getProperty("verify");
    if (Node.isPropertyAssignment(navVerify)) {
      const own = page.options.getProperty("verify");
      const navList = navVerify.getInitializer();
      const ownList = Node.isPropertyAssignment(own) ? own.getInitializer() : undefined;
      if (!own) moved.push(`verify: ${navList?.getText()}`);
      else if (Node.isArrayLiteralExpression(navList) && Node.isArrayLiteralExpression(ownList)) {
        const seen = new Set<string>();
        const all = [...navList.getElements(), ...ownList.getElements()].map((e) => e.getText()).filter((t) => !seen.has(t) && seen.add(t));
        ownList.replaceWithText(`[${all.join(", ")}]`);
      } else {
        problems.push(`${where}: its verify and ${nav.name}'s aren't both lists: merge them by hand`);
        continue;
      }
    }
    for (const name of ["expect", "screenshot"] as const) {
      const text = textOf(nav.options, name);
      if (text !== undefined && !page.options.getProperty(name)) moved.push(`${name}: ${text}`);
    }
    // What the moved fields use, imported in the page's file.
    const nsf = sfs.get(nav.file) as SourceFile;
    const used = new Set([...moved, nav.options.getProperty("verify")?.getText() ?? ""].join("\n").match(/[A-Za-z_$][\w$]*/g) ?? []);
    for (const imp of nsf.getImportDeclarations()) {
      const target = resolveImport(nav.file, imp.getModuleSpecifierValue());
      for (const n of imp.getNamedImports()) {
        const local = n.getAliasNode()?.getText() ?? n.getName();
        if (!used.has(local) || psf.getImportDeclarations().some((i) => i.getNamedImports().some((m) => (m.getAliasNode()?.getText() ?? m.getName()) === local))) continue;
        if (target) addImport(psf, n.getName(), target, js, n.getAliasNode()?.getText());
        else psf.addImportDeclaration({ moduleSpecifier: imp.getModuleSpecifierValue(), namedImports: [n.getAliasNode() ? { name: n.getName(), alias: n.getAliasNode()?.getText() ?? "" } : n.getName()] });
      }
    }
    // A helper the Nav declared for its url goes with it.
    const pageStatement = page.options.getFirstAncestorByKind(SyntaxKind.VariableStatement);
    for (const statement of nsf.getVariableStatements()) {
      const names = statement.getDeclarations().map((d) => d.getName());
      if (statement.isExported() || !names.some((n) => used.has(n)) || names.includes(nav.name)) continue;
      if (pageStatement) psf.insertStatements(pageStatement.getChildIndex(), `${statement.getText()}\n`);
      statement.remove();
    }
    // Written in place of `nav:`, so the page reads: name, checkpoint, url, ... .
    const navProp = page.options.getProperty("nav");
    if (navProp) {
      navProp.replaceWithText(moved.join(",\n") || "");
      if (!moved.length) navProp.remove();
    } else {
      for (const text of moved) page.options.addProperty(text);
    }
    for (const [file, sf] of users) {
      for (let again = true; again; ) {
        again = false;
        for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
          if (id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)) continue;
          const origin = importedFrom(sf, id.getText());
          if (origin?.file !== nav.file || origin.name !== nav.name) continue;
          id.replaceWithText(page.exportName);
          again = true;
          break;
        }
      }
      addImport(sf, page.exportName, page.file, js);
      touched.add(file);
    }
    nav.options.getFirstAncestorByKind(SyntaxKind.VariableStatement)?.remove();
    merged.set(`${nav.file}#${nav.name}`, page);
    touched.add(page.file);
    touched.add(nav.file);
  }

  // `Page.nav` is the page now.
  for (const [file, sf] of sfs) {
    for (let again = true; again; ) {
      again = false;
      for (const access of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
        if (access.getName() !== "nav") continue;
        const base = access.getExpression();
        if (!Node.isIdentifier(base)) continue;
        const origin = importedFrom(sf, base.getText());
        const page = [...new Set(merged.values())].find((p) => p.exportName === (origin?.name ?? base.getText()) && p.file === (origin?.file ?? file));
        if (!page) continue;
        access.replaceWithText(base.getText());
        again = true;
        touched.add(file);
        break;
      }
    }
  }

  const changed: string[] = [];
  for (const file of touched) pruneImports(sfs.get(file) as SourceFile);
  for (const file of touched) {
    const sf = sfs.get(file) as SourceFile;
    const onlyImports = sf.getStatements().every((s) => Node.isImportDeclaration(s));
    const importedElsewhere = [...sfs.entries()].some(([other, osf]) => other !== file && osf.getImportDeclarations().some((i) => resolveImport(other, i.getModuleSpecifierValue()) === file));
    if (onlyImports && !importedElsewhere && existsSync(file) && [...merged.keys()].some((k) => k.startsWith(`${file}#`))) {
      unlinkSync(file);
      changed.push(`${shown(file)} (removed)`);
      continue;
    }
    writeFileSync(file, sf.getFullText());
    changed.push(shown(file));
  }
  return { changed, problems };
}
