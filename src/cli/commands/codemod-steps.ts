// `waygraph upgrade --codemod lands`, `ff`, `chain` and `pages`: step forms a project wrote by hand, onto the map() options
// that do the same. `lands`: an alias that casts a branching Block to one outcome (`const Saved = SubmitBlock as
// MethodBlock<Form, Detail>`) becomes the step option (`.method(SubmitBlock, { lands: Detail })`), checked at runtime.
// `ff`: three or more chained steps that each pass `{ ff: true }` become one `.ffStart()` ... `.ffEnd()` window, the
// same fast-forward. `chain`: a flow's `.start()` and `.end()` go - the chain itself is the flow. `pages`: Blocks a
// Page Block names are used through it (`Page.nav`, `Page.do.x`). Works on the TypeScript AST.
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { CallExpression, SourceFile } from "ts-morph";
import { indentationOf } from "../../manifest/source.js";
import { walkDir } from "../../manifest/scan.js";
import { resolveImport } from "./codemod-keys.js";
import { hasFfTrue } from "../../analysis/built-in-check.js";

/** A file in the project, edited in its own indentation. */
function parse(project: Project, file: string): SourceFile {
  const text = readFileSync(file, "utf8");
  project.manipulationSettings.set({ indentationText: indentationOf(text) });
  return project.createSourceFile(file, text, { overwrite: true });
}

function projectFiles(dir: string): string[] {
  return walkDir(dir, /\.ts$/).filter((f) => !f.endsWith(".d.ts"));
}

/** `./x.js` from `from` to `to`, in the extension style the project's imports use. */
function specifier(from: string, to: string, js: boolean): string {
  let spec = relative(dirname(from), to).replace(/\\/g, "/").replace(/\.ts$/, js ? ".js" : "");
  if (!spec.startsWith(".")) spec = "./" + spec;
  return spec;
}

/** Where a name is declared: the file importing it (`import { X } from "./x.js"`) or the file itself. */
function sourceOf(sf: SourceFile, name: string): string | undefined {
  for (const imp of sf.getImportDeclarations()) {
    if (imp.getNamedImports().some((n) => (n.getAliasNode()?.getText() ?? n.getName()) === name)) return resolveImport(sf.getFilePath(), imp.getModuleSpecifierValue());
  }
  return sf.getVariableDeclaration(name) ? sf.getFilePath() : undefined;
}

/** Imports `name` as a value from `file` (merged into an import of that file already there). */
function importValue(sf: SourceFile, name: string, file: string): void {
  if (file === sf.getFilePath() || sf.getVariableDeclaration(name)) return;
  const js = sf.getImportDeclarations().some((d) => d.getModuleSpecifierValue().endsWith(".js"));
  for (const imp of sf.getImportDeclarations()) {
    if (resolveImport(sf.getFilePath(), imp.getModuleSpecifierValue()) !== file) continue;
    const named = imp.getNamedImports().find((n) => n.getName() === name);
    if (named) {
      if (named.isTypeOnly()) named.setIsTypeOnly(false);
      if (imp.isTypeOnly()) imp.setIsTypeOnly(false);
      return;
    }
    if (!imp.isTypeOnly()) {
      imp.addNamedImport(name);
      return;
    }
  }
  sf.addImportDeclaration({ namedImports: [name], moduleSpecifier: specifier(sf.getFilePath(), file, js) });
}

/** One alias: `const Saved = SubmitBlock as MethodBlock<Form, Detail>`. */
interface OutcomeAlias {
  file: string;
  alias: string;
  block: string;
  blockFile: string;
  lands: string;
  landsFile: string;
}

const OUTCOME_TYPES = new Set(["MethodBlock", "EffectBlock", "NavBlock", "PageBlock"]);
const STEP_METHODS = new Set(["method", "gotoPage", "gotoExternal"]);

function findAliases(project: Project, files: string[], dir: string, problems: string[]): OutcomeAlias[] {
  const found: OutcomeAlias[] = [];
  for (const file of files) {
    const sf = parse(project, file);
    for (const decl of sf.getVariableDeclarations()) {
      const init = decl.getInitializer();
      if (!Node.isAsExpression(init)) continue;
      const type = init.getTypeNode();
      if (!Node.isTypeReference(type) || !OUTCOME_TYPES.has(type.getTypeName().getText())) continue;
      const block = init.getExpression().getText();
      const lands = type.getTypeArguments().at(-1)?.getText() ?? "";
      const blockFile = sourceOf(sf, block);
      const landsFile = sourceOf(sf, lands);
      if (!/^[A-Za-z_$][\w$]*$/.test(block) || !/^[A-Za-z_$][\w$]*$/.test(lands) || !blockFile || !landsFile) {
        problems.push(`${relative(dir, file)}: ${decl.getName()} = ${init.getText()} - write the steps as .method(Block, { lands: Checkpoint }) by hand`);
        continue;
      }
      found.push({ file, alias: decl.getName(), block, blockFile, lands, landsFile });
    }
  }
  return found;
}

/** Rewrites every step that plays an alias in one file; returns whether it changed, and the aliases still used there. */
function rewriteSteps(sf: SourceFile, aliases: OutcomeAlias[]): { changed: boolean; stillUsed: Set<OutcomeAlias> } {
  const stillUsed = new Set<OutcomeAlias>();
  let changed = false;
  for (const a of aliases) {
    // Only where the name means this alias: the file declares it, or imports it from the file that does.
    if (sourceOf(sf, a.alias) !== a.file) continue;
    const ids = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => id.getText() === a.alias && !id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration));
    for (const id of ids) {
      if (id.wasForgotten()) continue;
      const call = id.getParent();
      const callee = Node.isCallExpression(call) ? call.getExpression() : undefined;
      if (!Node.isCallExpression(call) || call.getArguments()[0] !== id || !Node.isPropertyAccessExpression(callee) || !STEP_METHODS.has(callee.getName())) {
        if (!Node.isVariableDeclaration(id.getParent())) stillUsed.add(a);
        continue;
      }
      id.replaceWithText(a.block);
      const opts = call.getArguments()[1];
      const inner = Node.isObjectLiteralExpression(opts) ? opts.getText().slice(1, -1).trim() : "";
      if (Node.isObjectLiteralExpression(opts)) opts.replaceWithText(inner ? `{ lands: ${a.lands}, ${inner} }` : `{ lands: ${a.lands} }`);
      else call.addArgument(`{ lands: ${a.lands} }`);
      importValue(sf, a.block, a.blockFile);
      importValue(sf, a.lands, a.landsFile);
      changed = true;
    }
  }
  if (changed) {
    // An import of an alias nothing here uses any more goes.
    for (const imp of sf.getImportDeclarations()) {
      for (const named of imp.getNamedImports()) {
        const a = aliases.find((x) => x.alias === named.getName());
        if (a && !stillUsed.has(a) && sourceOf(sf, a.alias) === a.file && sf.getFilePath() !== a.file) named.remove();
      }
      if (imp.getNamedImports().length === 0 && !imp.getDefaultImport() && !imp.getNamespaceImport()) imp.remove();
    }
  }
  return { changed, stillUsed };
}

/** Runs `--codemod lands` over a project; returns the files changed or removed and what's left by hand. */
export function codemodLands(dir: string): { changed: string[]; problems: string[] } {
  const project = new Project({ useInMemoryFileSystem: true });
  const files = projectFiles(dir);
  const problems: string[] = [];
  const aliases = findAliases(project, files, dir, problems);
  if (aliases.length === 0) return { changed: [], problems };
  const changed = new Set<string>();
  const used = new Set<OutcomeAlias>();
  for (const file of files) {
    const sf = parse(project, file);
    const { changed: did, stillUsed } = rewriteSteps(sf, aliases);
    for (const a of stillUsed) used.add(a);
    if (did) {
      writeFileSync(file, sf.getFullText());
      changed.add(relative(dir, file));
    }
  }
  // An alias nothing uses goes; a file of nothing but such aliases goes with them.
  for (const file of new Set(aliases.map((a) => a.file))) {
    const sf = parse(project, file);
    for (const a of aliases.filter((x) => x.file === file)) {
      if (used.has(a)) {
        problems.push(`${relative(dir, file)}: ${a.alias} is used outside a step - replace it by hand`);
        continue;
      }
      sf.getVariableStatement(a.alias)?.remove();
    }
    sf.fixUnusedIdentifiers();
    if (sf.getStatements().every((s) => Node.isImportDeclaration(s))) {
      unlinkSync(file);
      changed.add(`${relative(dir, file)} (removed)`);
    } else {
      writeFileSync(file, sf.getFullText());
      changed.add(relative(dir, file));
    }
  }
  return { changed: [...changed], problems };
}

/** The receiver a chained call is made on (`a.b(x)` -> `a`). */
const receiver = (call: CallExpression): Node | undefined => {
  const callee = call.getExpression();
  return Node.isPropertyAccessExpression(callee) ? callee.getExpression() : undefined;
};

/** The runs of three or more chained `{ ff: true }` steps in a file, each from its first call to its last. */
function ffRuns(sf: SourceFile): CallExpression[][] {
  return sf
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((c) => hasFfTrue(c) && !hasFfTrue(c.getParent()?.getParent()))
    .map((last) => {
      const run: CallExpression[] = [];
      for (let at: Node | undefined = last; hasFfTrue(at); at = receiver(at)) run.unshift(at);
      return run;
    })
    .filter((run) => run.length >= 3 && run[0] && receiver(run[0]));
}

/** Rewrites each run of three or more `{ ff: true }` steps in one file's text; returns the new text. */
export function convertFfRuns(text: string): string {
  const project = new Project({ useInMemoryFileSystem: true, manipulationSettings: { indentationText: indentationOf(text) } });
  // One run per pass, on a fresh tree: an edit to the text forgets the nodes found before it.
  for (;;) {
    const sf = project.createSourceFile("/file.ts", text, { overwrite: true });
    const run = ffRuns(sf).at(-1);
    if (!run) return text;
    const first = run[0] as CallExpression;
    const last = run[run.length - 1] as CallExpression;
    const start = receiver(first) as Node;
    // The break before the first step's dot, kept for the two new steps.
    const dot = first.getExpression().asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    const gap = text.slice(start.getEnd(), dot.getNameNode().getStart() - 1);
    for (const call of [...run].reverse()) {
      for (const arg of call.getArguments()) {
        if (!Node.isObjectLiteralExpression(arg)) continue;
        arg.getProperty("ff")?.remove();
        if (arg.getProperties().length === 0) call.removeArgument(arg);
      }
    }
    const [lastEnd, startEnd] = [last.getEnd(), start.getEnd()];
    const edited = sf.getFullText();
    text = edited.slice(0, startEnd) + `${gap}.ffStart()` + edited.slice(startEnd, lastEnd) + `${gap}.ffEnd()` + edited.slice(lastEnd);
  }
}

/** Runs `--codemod ff` over a project; returns the files changed. */
export function codemodFf(dir: string): { changed: string[]; problems: string[] } {
  const changed: string[] = [];
  for (const file of projectFiles(dir)) {
    const before = readFileSync(file, "utf8");
    if (!before.includes("ff:")) continue;
    const after = convertFfRuns(before);
    if (after !== before) {
      writeFileSync(file, after);
      changed.push(relative(dir, file));
    }
  }
  return { changed, problems: [] };
}

/** The calls a flow chain is made of: a `.start()` / `.end()` after one of these is a flow's. */
const CHAIN_STEPS = new Set(["map", "gotoPage", "gotoExternal", "method", "assert", "flow", "steps", "set", "expect", "finally", "ffStart", "ffEnd", "start"]);

/** Whether `node` is (or ends) a flow chain: a step call on its way down, or the builder a `.branch()` route is given. */
function isChain(node: Node | undefined): boolean {
  for (let at = node; at; ) {
    if (Node.isCallExpression(at)) {
      const callee = at.getExpression();
      if (Node.isPropertyAccessExpression(callee) && CHAIN_STEPS.has(callee.getName())) return true;
      if (Node.isIdentifier(callee) && callee.getText() === "map") return true;
      at = Node.isPropertyAccessExpression(callee) ? callee.getExpression() : undefined;
    } else if (Node.isIdentifier(at)) {
      // `(m) => m.end()` as a route: m is the parameter of a function given to .branch({ ... }).
      const fn = at.getFirstAncestor((a) => Node.isArrowFunction(a) || Node.isFunctionExpression(a));
      const param = fn && (Node.isArrowFunction(fn) || Node.isFunctionExpression(fn)) ? fn.getParameters()[0]?.getName() : undefined;
      const branch = fn?.getFirstAncestorByKind(SyntaxKind.CallExpression)?.getExpression();
      return param === at.getText() && Node.isPropertyAccessExpression(branch) && branch.getName() === "branch";
    } else return false;
  }
  return false;
}

/** The first `.start()` / `.end()` on a flow chain in a file, or undefined. */
function chainEnd(sf: SourceFile): CallExpression | undefined {
  return sf.getDescendantsOfKind(SyntaxKind.CallExpression).find((call) => {
    const callee = call.getExpression();
    return (
      call.getArguments().length === 0 &&
      Node.isPropertyAccessExpression(callee) &&
      (callee.getName() === "start" || callee.getName() === "end") &&
      isChain(callee.getExpression())
    );
  });
}

/** Drops every flow chain's `.start()` and `.end()` from one file's text; returns the new text. */
export function convertChainEnds(text: string): string {
  const project = new Project({ useInMemoryFileSystem: true, manipulationSettings: { indentationText: indentationOf(text) } });
  for (;;) {
    const sf = project.createSourceFile("/file.ts", text, { overwrite: true });
    const call = chainEnd(sf);
    if (!call) return text;
    const receiver = call.getExpression().asKindOrThrow(SyntaxKind.PropertyAccessExpression).getExpression();
    text = text.slice(0, call.getStart()) + receiver.getText() + text.slice(call.getEnd());
  }
}

/** Runs `--codemod chain` over a project; returns the files changed. */
export function codemodChain(dir: string): { changed: string[]; problems: string[] } {
  const changed: string[] = [];
  for (const file of projectFiles(dir)) {
    const before = readFileSync(file, "utf8");
    if (!/\.(start|end)\(\s*\)/.test(before)) continue;
    const after = convertChainEnds(before);
    if (after !== before) {
      writeFileSync(file, after);
      changed.push(relative(dir, file));
    }
  }
  return { changed, problems: [] };
}

/** Where a Block is reached through a page: `Page.nav` or `Page.do.<name>`. */
interface PageAccess {
  page: string;
  pageFile: string;
  access: string;
}

/** Every Block a Page Block names (its `nav`, its `methods` record), by `file#exportName`; a page's nav wins. */
function pageAccessMap(project: Project, files: string[]): Map<string, PageAccess> {
  const found = new Map<string, PageAccess>();
  const methods: [string, PageAccess][] = [];
  for (const file of files) {
    const sf = parse(project, file);
    for (const decl of sf.getVariableDeclarations()) {
      const call = decl.getInitializer();
      if (!Node.isCallExpression(call) || call.getExpression().getText() !== "definePageBlock") continue;
      const options = call.getArguments()[0];
      if (!Node.isObjectLiteralExpression(options)) continue;
      const blockOf = (init: Node | undefined): string | undefined => {
        const body = Node.isArrowFunction(init) ? init.getBody() : init;
        return Node.isIdentifier(body) ? body.getText() : undefined;
      };
      const at = (name: string | undefined, access: string): void => {
        const source = name ? sourceOf(sf, name) : undefined;
        if (!name || !source) return;
        const entry: [string, PageAccess] = [`${source}#${name}`, { page: decl.getName(), pageFile: file, access }];
        if (access === "nav") found.set(...entry);
        else methods.push(entry);
      };
      const nav = options.getProperty("nav");
      if (Node.isPropertyAssignment(nav)) at(blockOf(nav.getInitializer()), "nav");
      if (Node.isShorthandPropertyAssignment(nav)) at(nav.getName(), "nav");
      const record = options.getProperty("methods");
      const init = Node.isPropertyAssignment(record) ? record.getInitializer() : undefined;
      if (!Node.isObjectLiteralExpression(init)) continue;
      for (const prop of init.getProperties()) {
        if (Node.isPropertyAssignment(prop)) at(blockOf(prop.getInitializer()), `do.${prop.getName()}`);
      }
    }
  }
  for (const [key, access] of methods) if (!found.has(key)) found.set(key, access);
  return found;
}

/** Rewrites one file's Block imports into its pages' namespaces; returns whether it changed. */
function usePages(sf: SourceFile, pages: Map<string, PageAccess>, dir: string, problems: string[]): boolean {
  let changed = false;
  for (const imp of sf.getImportDeclarations()) {
    const from = resolveImport(sf.getFilePath(), imp.getModuleSpecifierValue());
    if (!from) continue;
    for (const named of imp.getNamedImports()) {
      const local = named.getAliasNode()?.getText() ?? named.getName();
      const via = pages.get(`${from}#${named.getName()}`);
      if (!via || via.pageFile === sf.getFilePath()) continue;
      const uses = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => id.getText() === local && !id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration));
      if (uses.some((id) => id.getFirstAncestorByKind(SyntaxKind.ExportDeclaration))) {
        problems.push(`${relative(dir, sf.getFilePath())}: ${local} is re-exported - use ${via.page}.${via.access} by hand`);
        continue;
      }
      for (const id of uses) {
        const parent = id.getParent();
        // A property name that happens to match (`{ AddToCartBlock: … }`, `x.AddToCartBlock`) is not the Block.
        if ((Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) || (Node.isPropertyAssignment(parent) && parent.getNameNode() === id)) continue;
        if (Node.isShorthandPropertyAssignment(parent)) parent.replaceWithText(`${local}: ${via.page}.${via.access}`);
        else id.replaceWithText(`${via.page}.${via.access}`);
      }
      named.remove();
      importValue(sf, via.page, via.pageFile);
      changed = true;
    }
    if (!imp.wasForgotten() && imp.getNamedImports().length === 0 && !imp.getDefaultImport() && !imp.getNamespaceImport()) imp.remove();
  }
  return changed;
}

/**
 * Runs `--codemod pages` over a project: a file that imports Blocks a Page Block names (its `nav`, its `methods`) uses
 * them through the page instead (`Page.nav`, `Page.do.addItem`), one import per page. Block and Page files keep theirs.
 */
export function codemodPages(dir: string): { changed: string[]; problems: string[] } {
  const project = new Project({ useInMemoryFileSystem: true });
  const files = projectFiles(dir);
  const pages = pageAccessMap(project, files);
  const changed: string[] = [];
  const problems: string[] = [];
  if (pages.size === 0) return { changed, problems: ["no Page Block names a Block yet: give each page `nav` and a `methods` record first"] };
  for (const file of files.filter((f) => !f.endsWith(".block.ts"))) {
    const sf = parse(project, file);
    if (usePages(sf, pages, dir, problems)) {
      writeFileSync(file, sf.getFullText());
      changed.push(relative(dir, file));
    }
  }
  return { changed, problems };
}
