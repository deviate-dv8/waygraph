// `waygraph upgrade --codemod keys`: rewrites a project from one `key()` / `keyGroup()` per Mem key to one `keys()`
// namespace per file and namespace (`export const SaucedemoKeys = keys("saucedemo")<{ credentials: ...; ... }>()`), then
// every use: an import of the old key becomes an import of its namespace, `Creds.key` and `Creds` become
// `SaucedemoKeys.credentials`, and a `keyGroup` pair (`mem.set(Creds({ ... }))`) becomes `mem.set(SaucedemoKeys.credentials,
// { ... })`. Key names stay the same, so `--data` payloads and recorded runs still match. Works on the TypeScript AST.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { IndentationText, Node, Project, SyntaxKind } from "ts-morph";
import type { CallExpression, Identifier, SourceFile, VariableStatement } from "ts-morph";
import { walkDir } from "../../manifest/scan.js";

/** One old key: where it was declared, and what it becomes. */
interface OldKey {
  file: string;
  name: string;
  /** The namespace object it moves into (`SaucedemoKeys`), the namespace's name (`saucedemo`) and its field there. */
  namespace: string;
  ns: string;
  field: string;
  /** A keyGroup: used as `Creds.key` and `Creds(value)`. */
  group: boolean;
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** `"saucedemo"` -> `SaucedemoKeys`, `"hop-scotch"` -> `HopScotchKeys`. */
function namespaceVar(ns: string): string {
  return ns.split(/[^A-Za-z0-9]+/).filter(Boolean).map((p) => p[0]!.toUpperCase() + p.slice(1)).join("") + "Keys";
}

/** A `key<T>("ns.field")` / `keyGroup<T>("ns.field")` call: its type text, name and kind; undefined for anything else. */
function keyCall(node: Node | undefined): { type: string; name: string; group: boolean } | undefined {
  if (!Node.isCallExpression(node)) return undefined;
  const callee = node.getExpression().getText();
  if (callee !== "key" && callee !== "keyGroup") return undefined;
  const arg = node.getArguments()[0];
  const type = node.getTypeArguments()[0];
  if (!Node.isStringLiteral(arg) || !type) return undefined;
  return { type: type.getText(), name: arg.getLiteralValue(), group: callee === "keyGroup" };
}

/** A file in the project, edited in its own indentation (tabs, two or four spaces). */
function parse(project: Project, file: string): SourceFile {
  const text = readFileSync(file, "utf8");
  const indentationText = /\n\t/.test(text) ? IndentationText.Tab : /\n {4}\S/.test(text) && !/\n {2}\S/.test(text) ? IndentationText.FourSpaces : IndentationText.TwoSpaces;
  project.manipulationSettings.set({ indentationText });
  return project.createSourceFile(file, text, { overwrite: true });
}

/** The project file an import specifier points at (`./keys.js` -> `/abs/keys.ts`). */
function resolveImport(from: string, spec: string): string | undefined {
  if (!spec.startsWith(".")) return undefined;
  const base = resolve(dirname(from), spec);
  for (const candidate of [base.replace(/\.js$/, ".ts"), base + ".ts", base, resolve(base, "index.ts")]) {
    if (existsSync(candidate) && candidate.endsWith(".ts")) return candidate;
  }
  return undefined;
}

/** Pass 1: rewrites each file's key declarations into namespaces; returns the top-level keys (others can import). */
function convertDeclarations(project: Project, file: string, dir: string, problems: string[]): OldKey[] {
  const sf = parse(project, file);
  // Every key declared with a usable name, wherever it is (top level, or inside a test), with its references found by
  // the TypeScript language service - two functions may each declare their own `const K`.
  const found: { key: OldKey; type: string; doc: string; refs: number[] }[] = [];
  for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const call = keyCall(decl.getInitializer());
    if (!call) continue;
    const dot = call.name.indexOf(".");
    const ns = call.name.slice(0, dot);
    const field = call.name.slice(dot + 1);
    if (dot <= 0 || !IDENT.test(field)) {
      problems.push(`${relative(dir, file)}: "${call.name}" is not "<namespace>.<field>" - put it in a keys() namespace by hand (its name changes)`);
      continue;
    }
    const statement = decl.getVariableStatementOrThrow();
    // A key's doc comment moves onto its field, indented to sit inside the type.
    const doc = statement.getJsDocs().map((d) => d.getText().split("\n").map((line, i) => (i ? "  " + line.trimStart().replace(/^\*/, " *") : line)).join("\n")).join("\n");
    // Two keys with one name are two keys (Mem tells them apart by identity); one namespace field can't be both.
    const block = decl.getVariableStatementOrThrow().getParent();
    const twin = sf
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .filter((d) => d !== decl && keyCall(d.getInitializer())?.name === call.name && d.getVariableStatement()?.getParent() === block);
    if (twin.length) {
      problems.push(`${relative(dir, file)}: "${call.name}" names ${twin.length + 1} different keys - give each its own field by hand`);
      continue;
    }
    const nameNode = decl.getNameNode();
    if (!Node.isIdentifier(nameNode)) continue;
    const refs = nameNode.findReferencesAsNodes().filter((n) => n.getSourceFile() === sf && !n.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)).map((n) => n.getStart());
    found.push({ key: { file, name: decl.getName(), namespace: namespaceVar(ns), ns, field, group: call.group }, type: call.type, doc, refs });
  }
  if (found.length === 0) return [];
  // Uses first, last in the file first: replacing one never moves one still to do.
  for (const { key, refs } of found.flatMap((f) => f.refs.map((pos) => ({ key: f.key, refs: pos }))).sort((a, b) => b.refs - a.refs)) {
    const id = sf.getDescendantAtPos(refs);
    if (Node.isIdentifier(id)) rewriteUse(id, key);
  }
  // Then the declarations: one namespace per block and namespace, where the first of its keys was.
  const byBlock = new Map<Node, Map<string, { exported: boolean; fields: string[]; at: number; ns: string; statements: VariableStatement[] }>>();
  for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const call = keyCall(decl.getInitializer());
    const f = call && found.find((x) => x.key.name === decl.getName() && x.type === call.type && call.name === `${x.key.ns}.${x.key.field}`);
    if (!f) continue;
    const statement = decl.getVariableStatementOrThrow();
    const block = statement.getParentOrThrow();
    const groups = byBlock.get(block) ?? new Map();
    const g = groups.get(f.key.namespace) ?? { exported: false, fields: [], at: statement.getChildIndex(), ns: f.key.ns, statements: [] };
    g.exported ||= statement.isExported();
    g.fields.push(`${f.doc ? f.doc + "\n  " : ""}${f.key.field}: ${f.type};`);
    g.statements.push(statement);
    groups.set(f.key.namespace, g);
    byBlock.set(block, groups);
  }
  for (const [block, groups] of byBlock) {
    const container = block as unknown as { insertStatements(index: number, text: string[]): unknown };
    const first = Math.min(...[...groups.values()].map((g) => g.at));
    for (const g of groups.values()) for (const statement of g.statements) statement.remove();
    container.insertStatements(
      first,
      [...groups].map(([nsVar, g]) => `${Node.isSourceFile(block) ? "\n" : ""}${g.exported ? "export " : ""}const ${nsVar} = keys("${g.ns}")<{\n  ${g.fields.join("\n  ")}\n}>();`),
    );
  }
  replaceWaygraphImport(sf);
  writeFileSync(file, sf.getFullText());
  return found.map((f) => f.key);
}

/**
 * `import { key, keyGroup } from "waygraph"` -> `import { keys } from "waygraph"` (keeping whatever else it imports). Any
 * module: this runs only in a file whose key() calls were just converted, so a `key` it imports is that one.
 */
function replaceWaygraphImport(sf: SourceFile): void {
  for (const imp of sf.getImportDeclarations()) {
    const old = imp.getNamedImports().filter((n) => n.getName() === "key" || n.getName() === "keyGroup");
    if (old.length === 0) continue;
    for (const n of old) n.remove();
    if (!imp.getNamedImports().some((n) => n.getName() === "keys")) imp.addNamedImport("keys");
  }
}

/** Rewrites one use of a moved key: `Creds.key` / `Creds` -> `Keys.field`, a pair `Creds(value)` -> see replacePair. */
function rewriteUse(id: Identifier, k: OldKey): void {
  const target = `${k.namespace}.${k.field}`;
  const parent = id.getParent();
  if (k.group && Node.isPropertyAccessExpression(parent) && parent.getExpression() === id && parent.getName() === "key") parent.replaceWithText(target);
  else if (k.group && Node.isCallExpression(parent) && parent.getExpression() === id) replacePair(parent, target);
  else id.replaceWithText(target);
}

/** Rewrites every use of imported keys in a file (`local` name -> the key). */
function rewriteUses(sf: SourceFile, local: ReadonlyMap<string, OldKey>): void {
  // Last in the file first, so replacing one never invalidates one still to visit.
  const ids = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => local.has(id.getText()) && !isDeclarationOrImport(id)).reverse();
  for (const id of ids) if (!id.wasForgotten()) rewriteUse(id, local.get(id.getText())!);
}

function isDeclarationOrImport(id: Identifier): boolean {
  const parent = id.getParent();
  return (
    !!id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) ||
    (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) ||
    (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) ||
    (Node.isPropertyAssignment(parent) && parent.getNameNode() === id)
  );
}

/** A keyGroup pair `Creds(value)`: as the one argument of `.set(...)` it becomes `.set(Keys.field, value)`, else a tuple. */
function replacePair(call: CallExpression, target: string): void {
  const value = call.getArguments()[0]?.getText() ?? "undefined";
  const outer = call.getParent();
  if (Node.isCallExpression(outer) && outer.getArguments().length === 1 && /\.set$/.test(outer.getExpression().getText())) {
    outer.replaceWithText(`${outer.getExpression().getText()}(${target}, ${value})`);
    return;
  }
  call.replaceWithText(`[${target}, ${value}] as const`);
}

/** Pass 2: in a file that imports moved keys, imports their namespaces instead and rewrites the uses. */
function convertImports(project: Project, file: string, moved: ReadonlyMap<string, readonly OldKey[]>): boolean {
  const sf = parse(project, file);
  const local = new Map<string, OldKey>();
  for (const imp of sf.getImportDeclarations()) {
    const target = resolveImport(file, imp.getModuleSpecifierValue());
    const keysThere = target ? moved.get(target) : undefined;
    if (!keysThere) continue;
    const namespaces = new Set<string>();
    for (const named of imp.getNamedImports()) {
      const k = keysThere.find((m) => m.name === named.getName());
      if (!k) continue;
      local.set(named.getAliasNode()?.getText() ?? named.getName(), k);
      namespaces.add(k.namespace);
      named.remove();
    }
    for (const ns of namespaces) if (!imp.getNamedImports().some((n) => n.getName() === ns)) imp.addNamedImport(ns);
  }
  if (local.size === 0) return false;
  rewriteUses(sf, local);
  writeFileSync(file, sf.getFullText());
  return true;
}

/** Runs the codemod over a project's TypeScript (`src/`, `tests/`, `config/`). */
export function codemodKeys(dir: string): { changed: string[]; problems: string[] } {
  const project = new Project({ useInMemoryFileSystem: true });
  const files = walkDir(dir, /\.ts$/).filter((f) => !f.includes("node_modules") && !f.endsWith(".d.ts"));
  const problems: string[] = [];
  const changed = new Set<string>();
  const moved = new Map<string, OldKey[]>();
  for (const file of files) {
    const keysHere = convertDeclarations(project, file, dir, problems);
    if (keysHere.length) {
      moved.set(file, keysHere);
      changed.add(file);
    }
  }
  for (const file of files) if (convertImports(project, file, moved)) changed.add(file);
  // key() / keyGroup() still called somewhere the codemod couldn't name (inline, not a const).
  for (const file of files) {
    const sf = parse(project, file);
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      // A const with a name that isn't "<namespace>.<field>" was reported already.
      if (keyCall(call) && !Node.isVariableDeclaration(call.getParent())) problems.push(`${relative(dir, file)}: ${call.getText()} is not a const - declare it in a keys() namespace by hand`);
    }
  }
  return { changed: [...changed].map((f) => relative(dir, f)), problems };
}
