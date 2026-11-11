// `waygraph upgrade --codemod page-object`: a page's Read Block and its `reads()` namespace move into the Page Block.
// A Read Block whose Checkpoint has one Page Block becomes the page's `read: (ctx) => ({ ... })` (the namespace stays
// its name, as `readAs`, so run logs and `pilot read` don't change), `Namespace.field` becomes `Page.read.field`, and the
// Read Block and namespace go when nothing else uses them. A page's `methods: { x: () => Block }` becomes
// `do: () => ({ x: Block })`, `expects` thunks the same. What it can't place (a read shared by pages, one with no
// Checkpoint, one that needs Mem, two on a page) is listed and left as it was. Works on the TypeScript AST.
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { ArrowFunction, CallExpression, ObjectLiteralExpression, SourceFile, VariableDeclaration } from "ts-morph";
import { indentationOf } from "../../manifest/source.js";
import { walkDir } from "../../manifest/scan.js";
import { resolveImport as resolveRelative } from "./codemod-keys.js";

interface Namespace {
  file: string;
  name: string;
  ns: string;
}

interface ReadDecl {
  file: string;
  decl: VariableDeclaration;
  checkpoint: string;
  namespace: Namespace;
  fields: ObjectLiteralExpression;
  ctx: string;
  /** The Read Block's own options (its name and description). */
  options: ObjectLiteralExpression;
}

interface PageDecl {
  /** Made from a Read Block (the file is the read's, to be renamed). */
  fromRead?: boolean;
  file: string;
  exportName: string;
  options: ObjectLiteralExpression;
  checkpoint: string;
  /** What the read's namespace is called when it isn't given: the Checkpoint's name, or the layout's. */
  defaultNs: string;
  layout?: boolean;
}

function parse(project: Project, file: string): SourceFile {
  const text = readFileSync(file, "utf8");
  project.manipulationSettings.set({ indentationText: indentationOf(text) });
  return project.createSourceFile(file, text, { overwrite: true });
}

/** The project's `package.json` "imports" (`#map/*` -> `./src/map/*.ts`), as prefix and folder. */
let aliases: { prefix: string; folder: string }[] = [];

function loadAliases(dir: string): void {
  aliases = [];
  const pkg = join(dir, "package.json");
  if (!existsSync(pkg)) return;
  const imports = (JSON.parse(readFileSync(pkg, "utf8")) as { imports?: Record<string, string> }).imports ?? {};
  for (const [key, target] of Object.entries(imports)) {
    if (key.endsWith("/*") && typeof target === "string" && target.endsWith("*.ts")) aliases.push({ prefix: key.slice(0, -1), folder: resolve(dir, target.slice(0, -4)) });
  }
}

/** The project file an import specifier points at: relative, or through an "imports" alias. */
function resolveImport(from: string, spec: string): string | undefined {
  const alias = aliases.find((a) => spec.startsWith(a.prefix));
  if (alias) {
    const file = join(alias.folder, spec.slice(alias.prefix.length)) + ".ts";
    return existsSync(file) ? file : undefined;
  }
  return resolveRelative(from, spec);
}

/** An import specifier for `to` from `from`: an alias where the file's other imports use them, else relative. */
function specifierFor(from: string, to: string, js: boolean, aliased: boolean): string {
  const alias = aliased ? aliases.find((a) => to.startsWith(a.folder + "/")) : undefined;
  if (alias) return alias.prefix + to.slice(alias.folder.length + 1).replace(/\.ts$/, "");
  const spec = relative(dirname(from), to).replace(/\\/g, "/").replace(/\.ts$/, js ? ".js" : "");
  return spec.startsWith(".") ? spec : "./" + spec;
}

const lowerFirst = (name: string): string => name.charAt(0).toLowerCase() + name.slice(1);

/** The text of a string-literal property or an identifier value of an object literal: `name: "x"`, `from: Cp`. */
function propertyOf(options: ObjectLiteralExpression, name: string): Node | undefined {
  const prop = options.getProperty(name);
  return Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
}

/** What a name in `sf` is imported from (a project file, and its name there), if it's an import. */
function importedFrom(sf: SourceFile, name: string): { file: string; name: string } | undefined {
  for (const imp of sf.getImportDeclarations()) {
    const named = imp.getNamedImports().find((n) => (n.getAliasNode()?.getText() ?? n.getName()) === name);
    const file = named ? resolveImport(sf.getFilePath(), imp.getModuleSpecifierValue()) : undefined;
    if (named && file) return { file, name: named.getName() };
  }
  return undefined;
}

/** `text` indented as the body of a property of an object literal indented by `base`. */
function reindented(text: string, base: string): string {
  const lines = text.split("\n");
  const rest = lines.slice(1).filter((l) => l.trim());
  const common = Math.min(...rest.map((l) => l.length - l.trimStart().length), Infinity);
  return [lines[0], ...lines.slice(1).map((l) => (l.trim() ? base + l.slice(Number.isFinite(common) ? common : 0) : l))].join("\n");
}

/** `const X = reads("ns")<T>()`. */
function namespaceOf(decl: VariableDeclaration, file: string): Namespace | undefined {
  const init = decl.getInitializer();
  if (!Node.isCallExpression(init)) return undefined;
  const inner = init.getExpression();
  if (!Node.isCallExpression(inner) || inner.getExpression().getText() !== "reads") return undefined;
  const arg = inner.getArguments()[0];
  return Node.isStringLiteral(arg) ? { file, name: decl.getName(), ns: arg.getLiteralValue() } : undefined;
}

/** The call an arrow's body returns: `(ctx) => Ns({ ... })` or `{ return Ns({ ... }); }`. */
function returnedCall(fn: ArrowFunction): CallExpression | undefined {
  let body: Node | undefined = fn.getBody();
  if (Node.isBlock(body)) {
    const statements = body.getStatements();
    const only = statements.length === 1 ? statements[0] : undefined;
    body = Node.isReturnStatement(only) ? only.getExpression() : undefined;
  }
  while (Node.isParenthesizedExpression(body)) body = body.getExpression();
  return Node.isCallExpression(body) ? body : undefined;
}

/** `{ a: () => X }` -> `() => ({ a: X })`: a record of thunks becomes one function of the page. */
function unthunked(record: ObjectLiteralExpression): string {
  const entries = record.getProperties().map((prop) => {
    if (Node.isPropertyAssignment(prop)) {
      const init = prop.getInitializer();
      if (Node.isArrowFunction(init) && init.getParameters().length === 0 && !Node.isBlock(init.getBody())) return `${prop.getName()}: ${init.getBody().getText()}`;
    }
    return prop.getText();
  });
  return `() => ({ ${entries.join(", ")} })`;
}

/** Files each file imports, among the project's (to tell where a new import would close a cycle). */
function importGraph(sfs: ReadonlyMap<string, SourceFile>): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const [file, sf] of sfs) {
    graph.set(file, sf.getImportDeclarations().map((i) => resolveImport(file, i.getModuleSpecifierValue())).filter((t): t is string => t !== undefined));
  }
  return graph;
}

function reaches(graph: ReadonlyMap<string, string[]>, from: string, to: string): boolean {
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
function pruneImports(sf: SourceFile): void {
  const used = new Set(
    sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => !id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)).map((id) => id.getText()),
  );
  for (const imp of sf.getImportDeclarations()) {
    const named = imp.getNamedImports();
    if (!named.length) continue;
    for (const n of named) if (!used.has(n.getAliasNode()?.getText() ?? n.getName())) n.remove();
    if (!imp.getNamedImports().length && !imp.getDefaultImport() && !imp.getNamespaceImport()) imp.remove();
  }
}

function addImport(sf: SourceFile, name: string, target: string, js: boolean, alias?: string): void {
  const spec = specifierFor(sf.getFilePath(), target, js, sf.getImportDeclarations().some((i) => i.getModuleSpecifierValue().startsWith("#")));
  const existing = sf.getImportDeclarations().find((i) => resolveImport(sf.getFilePath(), i.getModuleSpecifierValue()) === target);
  if (existing) {
    if (!existing.getNamedImports().some((n) => n.getName() === name && n.getAliasNode()?.getText() === alias)) existing.addNamedImport(alias ? { name, alias } : name);
  } else {
    sf.addImportDeclaration({ moduleSpecifier: spec, namedImports: [alias ? { name, alias } : name] });
  }
}

/** Turns a Read Block with no Page Block into one in place: `defineReadBlock({ ... read })` -> `definePageBlock({ ..., read })`. */
function pageFromRead(r: ReadDecl, used: Set<string>): PageDecl | undefined {
  const statement = r.decl.getVariableStatement();
  if (!statement) return undefined;
  const base = r.decl.getName().replace(/ReadBlock$|Read$/, "");
  const exportName = used.has(`${base}Page`) ? undefined : `${base}Page`;
  if (!exportName) return undefined;
  used.add(exportName);
  const nameText = (r.options.getProperty("name") as import("ts-morph").PropertyAssignment | undefined)?.getInitializer()?.getText() ?? JSON.stringify(base);
  const description = (r.options.getProperty("description") as import("ts-morph").PropertyAssignment | undefined)?.getText();
  const pageName = nameText.replace(/^(["'])read-/, "$1page-");
  const inferred = lowerFirst(r.checkpoint) === r.namespace.ns ? "" : `,\n  readAs: ${JSON.stringify(r.namespace.ns)}`;
  const text = `${statement.isExported() ? "export " : ""}const ${exportName} = definePageBlock({
  name: ${pageName},${description ? `\n  ${description},` : ""}
  checkpoint: ${r.checkpoint},
  read: (${r.ctx}) => (${reindented(r.fields.getText(), "")})${inferred},
});`;
  const sf = statement.getSourceFile();
  const index = statement.getChildIndex();
  statement.replaceWithText(text);
  const created = sf.getVariableDeclaration(exportName)!;
  created.getVariableStatement()?.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression)?.getDescendantsOfKind(SyntaxKind.ArrowFunction)[0]?.formatText();
  const waygraph = sf.getImportDeclaration((i) => i.getModuleSpecifierValue() === "waygraph");
  if (waygraph) {
    if (!waygraph.getNamedImports().some((n) => n.getName() === "definePageBlock")) waygraph.addNamedImport("definePageBlock");
  } else sf.addImportDeclaration({ moduleSpecifier: "waygraph", namedImports: ["definePageBlock"] });
  void index;
  return { file: sf.getFilePath(), exportName, options: created.getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression).getArguments()[0] as ObjectLiteralExpression, checkpoint: r.checkpoint, defaultNs: lowerFirst(r.checkpoint) };
}

/** Runs the codemod over a project's TypeScript (`src/`, `tests/`, `config/`). */
export function codemodPageObject(dir: string): { changed: string[]; problems: string[] } {
  loadAliases(dir);
  const project = new Project({ useInMemoryFileSystem: true });
  const files = walkDir(dir, /\.ts$/).filter((f) => !f.includes("node_modules") && !f.endsWith(".d.ts"));
  const sfs = new Map(files.map((f) => [f, parse(project, f)] as const));
  const touched = new Set<string>();
  const problems: string[] = [];
  const shown = (f: string) => relative(dir, f);

  const namespaces = new Map<string, Namespace>();
  const reads: ReadDecl[] = [];
  const pages: PageDecl[] = [];
  const layouts: PageDecl[] = [];
  const js = [...sfs.values()].some((sf) => sf.getImportDeclarations().some((i) => i.getModuleSpecifierValue().endsWith(".js")));

  for (const [file, sf] of sfs) {
    for (const decl of sf.getVariableDeclarations()) {
      const ns = namespaceOf(decl, file);
      if (ns) namespaces.set(`${file}#${ns.name}`, ns);
    }
  }
  for (const [file, sf] of sfs) {
    for (const decl of sf.getVariableDeclarations()) {
      const init = decl.getInitializer();
      if (!Node.isCallExpression(init)) continue;
      const callee = init.getExpression().getText();
      const options = init.getArguments()[0];
      if (!Node.isObjectLiteralExpression(options)) continue;
      if (callee === "definePageBlock") {
        const cp = propertyOf(options, "checkpoint");
        if (Node.isIdentifier(cp)) pages.push({ file, exportName: decl.getName(), options, checkpoint: cp.getText(), defaultNs: lowerFirst(cp.getText()) });
      }
      if (callee === "defineLayout") {
        const layoutName = propertyOf(options, "name");
        if (Node.isStringLiteral(layoutName)) layouts.push({ file, exportName: decl.getName(), options, checkpoint: "*", defaultNs: layoutName.getLiteralValue(), layout: true });
      }
      if (callee !== "defineReadBlock") continue;
      const name = propertyOf(options, "name")?.getText() ?? decl.getName();
      let from = propertyOf(options, "from");
      if (Node.isArrayLiteralExpression(from) && from.getElements().length === 1) from = from.getElements()[0];
      const everywhere = from === undefined;
      if (!everywhere && !Node.isIdentifier(from)) {
        problems.push(`${shown(file)}: ${name} reads several pages: move what it reads into each page's read by hand`);
        continue;
      }
      if (options.getProperty("requires")) {
        problems.push(`${shown(file)}: ${name} needs Mem keys (requires): put it in the page's read by hand`);
        continue;
      }
      const instruction = propertyOf(options, "instruction");
      const read = Node.isObjectLiteralExpression(instruction) ? propertyOf(instruction, "read") : undefined;
      const call = Node.isArrowFunction(read) ? returnedCall(read) : undefined;
      const nsName = call?.getExpression().getText();
      const imported = nsName ? importedFrom(sf, nsName) : undefined;
      const namespace = nsName ? namespaces.get(`${imported?.file ?? file}#${imported?.name ?? nsName}`) : undefined;
      const fields = call?.getArguments()[0];
      if (!Node.isArrowFunction(read) || !namespace || !Node.isObjectLiteralExpression(fields)) {
        problems.push(`${shown(file)}: ${name} doesn't return one namespace's fields (Ns({ ... })): fold it into the page's read by hand`);
        continue;
      }
      reads.push({ file, decl, checkpoint: everywhere ? "*" : from!.getText(), namespace, fields, ctx: read.getParameters()[0]?.getText() ?? "ctx", options });
    }
  }
  if (reads.length === 0 && pages.length === 0) return { changed: [], problems: ["no Page Block or Read Block found"] };

  const graph = importGraph(sfs);
  const converted = new Map<string, PageDecl>();
  const perPage = new Map<PageDecl, ReadDecl[]>();
  const used = new Set([...sfs.values()].flatMap((sf) => sf.getVariableDeclarations().map((d) => d.getName())));
  for (const r of reads) {
    // A Read Block for every page goes to the layout over its folder.
    if (r.checkpoint === "*") {
      const over = layouts.filter((l) => dirname(r.file).startsWith(dirname(l.file)));
      const nearest = over.length ? Math.max(...over.map((l) => dirname(l.file).length)) : -1;
      const here = over.filter((l) => dirname(l.file).length === nearest);
      if (here.length !== 1 || here[0]!.options.getProperty("read")) {
        problems.push(`${shown(r.file)}: ${r.decl.getName()} reads every page, and ${here.length === 1 ? "its layout has a read already" : `there are ${here.length} layouts over it`}: put it in a layout's read by hand`);
        continue;
      }
      perPage.set(here[0]!, [...(perPage.get(here[0]!) ?? []), r]);
      continue;
    }
    const candidates = pages.filter((p) => p.checkpoint === r.checkpoint);
    // A Checkpoint with a Read Block and no Page Block: the Read Block becomes the page, with the same file and place.
    if (candidates.length === 0 && reads.filter((o) => o.checkpoint === r.checkpoint).length === 1) {
      const created = pageFromRead(r, used);
      if (!created) {
        problems.push(`${shown(r.file)}: ${r.decl.getName()} can't be made a Page Block (its name is taken): make the page by hand`);
        continue;
      }
      pages.push(created);
      converted.set(`${r.namespace.file}#${r.namespace.name}`, created);
      touched.add(r.file);
      created.fromRead = true;
      continue;
    }
    if (candidates.length !== 1) {
      problems.push(`${shown(r.file)}: ${r.decl.getName()} reads ${r.checkpoint}, which has ${candidates.length} Page Blocks: move it into the page's read by hand`);
      continue;
    }
    perPage.set(candidates[0]!, [...(perPage.get(candidates[0]!) ?? []), r]);
  }
  for (const [page, list] of perPage) {
    const [r] = list;
    if (list.length > 1 || !r || page.options.getProperty("read")) {
      problems.push(`${shown(page.file)}: ${page.exportName} has ${list.length} Read Blocks (or a read already): merge them by hand`);
      continue;
    }
    const psf = sfs.get(page.file)!;
    const rsf = sfs.get(r.file)!;
    // What the read uses, imported in the page's file.
    const names = new Set(r.fields.getDescendantsOfKind(SyntaxKind.Identifier).map((id) => id.getText()));
    const local = rsf.getVariableDeclarations().filter((d) => names.has(d.getName()) && !namespaces.has(`${r.file}#${d.getName()}`));
    if (local.length) {
      problems.push(`${shown(r.file)}: ${r.decl.getName()} uses ${local.map((d) => d.getName()).join(", ")}, declared in its own file: move it by hand`);
      continue;
    }
    for (const imp of rsf.getImportDeclarations()) {
      const target = resolveImport(r.file, imp.getModuleSpecifierValue());
      for (const n of imp.getNamedImports()) {
        const local = n.getAliasNode()?.getText() ?? n.getName();
        if (!names.has(local) || psf.getImportDeclarations().some((i) => i.getNamedImports().some((m) => (m.getAliasNode()?.getText() ?? m.getName()) === local))) continue;
        if (target) addImport(psf, n.getName(), target, js, n.getAliasNode()?.getText());
        else psf.addImportDeclaration({ moduleSpecifier: imp.getModuleSpecifierValue(), namedImports: [n.getAliasNode() ? { name: n.getName(), alias: n.getAliasNode()!.getText() } : n.getName()] });
      }
    }
    const ctx = r.ctx;
    const added = page.options.addPropertyAssignment({ name: "read", initializer: `(${ctx}) => (${reindented(r.fields.getText(), "")})` });
    added.getInitializerOrThrow().formatText();
    if (r.namespace.ns !== page.defaultNs) page.options.addPropertyAssignment({ name: "readAs", initializer: JSON.stringify(r.namespace.ns) });
    converted.set(`${r.namespace.file}#${r.namespace.name}`, page);
    r.decl.getVariableStatement()?.remove();
    touched.add(page.file);
    touched.add(r.file);
  }

  // Every `Namespace.field` outside the page becomes `Page.read.field`, unless the page already reaches that file.
  for (const [file, sf] of sfs) {
    let changed = false;
    let needsTrait = false;
    const left = new Set<number>();
    // One use at a time, found afresh: a rewrite invalidates the nodes around it.
    for (let again = true; again; ) {
      again = false;
      for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
        if (left.has(id.getStart()) || id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)) continue;
        const parent = id.getParent();
        if (!Node.isPropertyAccessExpression(parent) || parent.getExpression() !== id) continue;
        const imported = importedFrom(sf, id.getText());
        const page = converted.get(`${imported?.file ?? file}#${imported?.name ?? id.getText()}`);
        if (!page || file === page.file) continue;
        const start = id.getStart();
        if (reaches(graph, page.file, file)) {
          // A file the page imports can't use the page while loading: its checks become functions, called when it runs.
          const list = id.getFirstAncestorByKind(SyntaxKind.ArrayLiteralExpression);
          const owner = list?.getParent();
          const inFunction = Node.isArrowFunction(owner) && Node.isPropertyAssignment(owner.getParent()) && (owner.getParent() as import("ts-morph").PropertyAssignment).getName() === "verify";
          if (!list || !(inFunction || (Node.isPropertyAssignment(owner) && owner.getName() === "verify"))) {
            left.add(start);
            continue;
          }
          id.replaceWithText(`${page.exportName}.read`);
          if (Node.isPropertyAssignment(owner)) owner.getInitializerOrThrow().replaceWithText(`(): Trait[] => ${list.getText()}`);
          needsTrait = true;
        } else {
          id.replaceWithText(`${page.exportName}.read`);
        }
        addImport(sf, page.exportName, page.file, js);
        changed = true;
        again = true;
        break;
      }
    }
    if (needsTrait && !sf.getImportDeclarations().some((i) => i.getNamedImports().some((n) => n.getName() === "Trait"))) {
      const waygraph = sf.getImportDeclaration((i) => i.getModuleSpecifierValue() === "waygraph");
      if (waygraph) waygraph.addNamedImport({ name: "Trait", isTypeOnly: true });
      else sf.addImportDeclaration({ moduleSpecifier: "waygraph", namedImports: [{ name: "Trait", isTypeOnly: true }] });
    }
    if (changed) touched.add(file);
  }

  // The `reads()` namespaces nothing uses now go; so do read files left empty.
  for (const [key, page] of converted) {
    const ns = namespaces.get(key)!;
    const sf = sfs.get(ns.file)!;
    const decl = sf.getVariableDeclaration(ns.name);
    const stillUsed = [...sfs.entries()].some(([other, osf]) =>
      osf.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => {
        if (id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) || id === decl?.getNameNode()) return false;
        const from = importedFrom(osf, id.getText());
        return from ? from.file === ns.file && from.name === ns.name : other === ns.file && id.getText() === ns.name;
      }),
    );
    if (stillUsed) {
      problems.push(`${shown(ns.file)}: ${ns.name} is still used where ${page.exportName} can't be imported (it would be a cycle): it names the same read as ${page.exportName}.read`);
      continue;
    }
    decl?.getVariableStatement()?.remove();
    touched.add(ns.file);
    // An import of it nothing uses (it was dead already) goes with it.
    for (const [other, osf] of sfs) {
      for (const imp of osf.getImportDeclarations()) {
        for (const n of imp.getNamedImports()) {
          if (n.getName() === ns.name && resolveImport(other, imp.getModuleSpecifierValue()) === ns.file) {
            n.remove();
            touched.add(other);
          }
        }
      }
    }
  }

  // methods / expects thunks -> do / expects as functions of the page.
  for (const page of pages) {
    const methods = page.options.getProperty("methods");
    if (Node.isPropertyAssignment(methods) && Node.isObjectLiteralExpression(methods.getInitializer())) {
      methods.replaceWithText(`do: ${unthunked(methods.getInitializer() as ObjectLiteralExpression)}`);
      touched.add(page.file);
    }
    const expects = page.options.getProperty("expects");
    const record = Node.isPropertyAssignment(expects) ? expects.getInitializer() : undefined;
    if (Node.isObjectLiteralExpression(record) && record.getProperties().length > 0) {
      (expects as import("ts-morph").PropertyAssignment).setInitializer(unthunked(record));
      touched.add(page.file);
    }
  }

  const changed: string[] = [];
  for (const file of touched) {
    const sf = sfs.get(file)!;
    pruneImports(sf);
    const onlyImports = sf.getStatements().every((s) => Node.isImportDeclaration(s));
    if (onlyImports && reads.some((r) => r.file === file)) {
      // A Read Block file with nothing left: other files import nothing from it (its Block was never exported by name).
      const imported = [...sfs.entries()].some(([other, osf]) => other !== file && osf.getImportDeclarations().some((i) => resolveImport(other, i.getModuleSpecifierValue()) === file));
      if (!imported) {
        unlinkSync(file);
        changed.push(shown(file) + " (removed)");
        continue;
      }
    }
    // A Read Block's file that is a page now is named for it, when no other file imports it by name.
    const renamed = pages.some((p) => p.fromRead && p.file === file) ? file.replace(/read\.block\.ts$/, "page.block.ts") : file;
    const taken = renamed !== file && (existsSync(renamed) || [...sfs.entries()].some(([other, osf]) => other !== file && osf.getImportDeclarations().some((i) => resolveImport(other, i.getModuleSpecifierValue()) === file)));
    if (renamed !== file && !taken) {
      writeFileSync(renamed, sf.getFullText());
      unlinkSync(file);
      changed.push(`${shown(file)} -> ${shown(renamed)}`);
      continue;
    }
    writeFileSync(file, sf.getFullText());
    changed.push(shown(file));
  }
  return { changed, problems };
}
