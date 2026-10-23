// `waygraph upgrade --codemod checkpoints`: rewrites a project from tag strings and `<In, Out>` type arguments to
// Checkpoint values (`export const Home = checkpoint("Home")`, `checkpoint: Home`, `from: Home, to: ItemInCart`). Works
// on the TypeScript AST (ts-morph), so formatting, comments and odd line breaks don't fool it.
import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { IndentationText, Node, Project, SyntaxKind } from "ts-morph";
import type { CallExpression, ObjectLiteralExpression, SourceFile } from "ts-morph";
import { walkDir } from "../../manifest/scan.js";

/** Checkpoint name -> tag, and union aliases -> member names, found in the states files. */
interface StatesInfo {
  tags: Map<string, string>;
  unions: Map<string, string[]>;
}

function parse(text: string): SourceFile {
  const indentationText = /\n\t/.test(text) ? IndentationText.Tab : /\n {4}\S/.test(text) && !/\n {2}\S/.test(text) ? IndentationText.FourSpaces : IndentationText.TwoSpaces;
  return new Project({ useInMemoryFileSystem: true, manipulationSettings: { indentationText } }).createSourceFile("/file.ts", text);
}

/** Whether `name` is still used anywhere outside import statements. */
function usedOutsideImports(sf: SourceFile, name: string): boolean {
  return sf.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => {
    if (id.getText() !== name || id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)) return false;
    const parent = id.getParent();
    return !(Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) && !(Node.isPropertyAssignment(parent) && parent.getNameNode() === id);
  });
}

/** Drops a named import from "waygraph" that nothing uses any more (and the import, when it ends up empty). */
function dropUnusedWaygraphImport(sf: SourceFile, name: string): void {
  if (usedOutsideImports(sf, name)) return;
  for (const imp of sf.getImportDeclarations().filter((d) => d.getModuleSpecifierValue() === "waygraph")) {
    imp.getNamedImports().find((n) => n.getName() === name)?.remove();
    if (imp.getNamedImports().length === 0 && !imp.getDefaultImport() && !imp.getNamespaceImport()) imp.remove();
  }
}

/** Learns Checkpoint declarations already in value form, so the codemod can run again after a partial run. */
function learnValues(sf: SourceFile, info: StatesInfo): void {
  for (const decl of sf.getVariableDeclarations()) {
    const init = decl.getInitializer();
    if (Node.isCallExpression(init) && init.getExpression().getText() === "checkpoint") {
      const tag = init.getArguments()[0];
      if (Node.isStringLiteral(tag)) info.tags.set(decl.getName(), tag.getLiteralValue());
    } else if (Node.isAsExpression(init) && Node.isArrayLiteralExpression(init.getExpression())) {
      info.unions.set(decl.getName(), init.getExpression().asKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements().map((e) => e.getText()));
    }
  }
}

/** Rewrites one states file; returns the new text and what it declared. */
export function convertStates(text: string, info: StatesInfo): string {
  const sf = parse(text);
  learnValues(sf, info);
  let changed = false;
  for (const alias of sf.getTypeAliases()) {
    if (!alias.isExported()) continue;
    const name = alias.getName();
    const type = alias.getTypeNodeOrThrow();
    if (Node.isTypeReference(type) && type.getTypeName().getText() === "Checkpoint") {
      const arg = type.getTypeArguments()[0];
      if (!Node.isLiteralTypeNode(arg) || !Node.isStringLiteral(arg.getLiteral())) continue;
      const tag = arg.getLiteral().asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
      info.tags.set(name, tag);
      alias.replaceWithText(`export const ${name} = checkpoint("${tag}");\nexport type ${name} = typeof ${name};`);
      changed = true;
    } else if (Node.isUnionTypeNode(type)) {
      const names = type.getTypeNodes().map((t) => t.getText());
      if (!names.every((n) => info.tags.has(n) || info.unions.has(n))) continue;
      const flat = names.flatMap((n) => info.unions.get(n) ?? [n]);
      info.unions.set(name, flat);
      alias.replaceWithText(`export const ${name} = [${flat.join(", ")}] as const;\nexport type ${name} = (typeof ${name})[number];`);
      changed = true;
    }
  }
  if (!changed) return text;
  // `checkpoint` is now used as a value; `Checkpoint` stays only while something still names the type.
  const wg = sf.getImportDeclarations().find((d) => d.getModuleSpecifierValue() === "waygraph");
  if (!wg) sf.insertImportDeclaration(0, { moduleSpecifier: "waygraph", namedImports: ["checkpoint"] });
  else if (wg.isTypeOnly()) sf.insertImportDeclaration(wg.getChildIndex(), { moduleSpecifier: "waygraph", namedImports: ["checkpoint"] });
  else if (!wg.getNamedImports().some((n) => n.getName() === "checkpoint")) wg.addNamedImport("checkpoint");
  dropUnusedWaygraphImport(sf, "Checkpoint");
  return sf.getFullText();
}

const SINGLE_CHECKPOINT = ["defineNavBlock", "defineNavClickBlock", "defineMemNavBlock", "definePageBlock", "defineAssertBlock"];
const ROUTED = ["defineMethodBlock", "defineEffectBlock"];

function optionsOf(call: CallExpression): ObjectLiteralExpression | undefined {
  const arg = call.getArguments()[0];
  return Node.isObjectLiteralExpression(arg) ? arg : undefined;
}

/** `checkpoint: "Home"` with `<Home>` becomes `checkpoint: Home`. */
function convertSingle(call: CallExpression, fn: string, info: StatesInfo, skipped: string[]): void {
  const typeArg = call.getTypeArguments()[0];
  const prop = optionsOf(call)?.getProperty("checkpoint");
  const value = Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
  if (!typeArg || !Node.isPropertyAssignment(prop) || !Node.isStringLiteral(value)) return;
  const name = typeArg.getText();
  if (info.tags.get(name) !== value.getLiteralValue()) {
    skipped.push(`${fn}<${name}>`);
    return;
  }
  call.removeTypeArgument(typeArg);
  prop.setInitializer(name);
}

/** `<In, Out>` becomes `from: In, to: Out` (right after the name and description); a resolve that only returns `to` goes. */
function convertRouted(call: CallExpression, fn: string, info: StatesInfo, skipped: string[]): void {
  const [fromArg, toArg] = call.getTypeArguments();
  const options = optionsOf(call);
  if (!fromArg || !toArg || !options) return;
  const from = fromArg.getText();
  const to = toArg.getText();
  const known = (n: string) => info.tags.has(n) || info.unions.has(n);
  const anywhere = from === "Checkpoint<string>";
  if ((!anywhere && !known(from)) || !known(to)) {
    skipped.push(`${fn}<${from}, ${to}>`);
    return;
  }
  call.removeTypeArgument(toArg);
  call.removeTypeArgument(fromArg);
  const props = options.getProperties();
  const after = Math.max(...["name", "description"].map((n) => props.findIndex((p) => Node.isPropertyAssignment(p) && p.getName() === n)));
  options.insertPropertyAssignments(after + 1, [...(anywhere ? [] : [{ name: "from", initializer: from }]), { name: "to", initializer: to }]);
  const tag = info.tags.get(to);
  const instruction = options.getProperty("instruction");
  const body = Node.isPropertyAssignment(instruction) ? instruction.getInitializer() : undefined;
  const resolve = Node.isObjectLiteralExpression(body) ? body.getProperty("resolve") : undefined;
  if (tag && Node.isPropertyAssignment(resolve) && resolve.getInitializer()?.getText().replace(/\s/g, "") === `()=>checkpoint("${tag}")`) resolve.remove();
  // Inserting and removing properties leaves the object's indentation uneven; tidy just this call.
  call.formatText({ indentSize: call.getSourceFile().getProject().manipulationSettings.getIndentationText().length, convertTabsToSpaces: !call.getSourceFile().getFullText().includes("\n\t") });
}

/** Rewrites one Block file. Calls whose Checkpoints are not plain declared names are left as they are. */
export function convertBlocks(text: string, info: StatesInfo): { text: string; skipped: string[] } {
  const sf = parse(text);
  const skipped: string[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression).reverse()) {
    if (call.wasForgotten()) continue;
    const fn = call.getExpression().getText();
    if (SINGLE_CHECKPOINT.includes(fn)) convertSingle(call, fn, info, skipped);
    else if (ROUTED.includes(fn)) convertRouted(call, fn, info, skipped);
  }
  if (sf.getFullText() === text) return { text, skipped };
  dropUnusedWaygraphImport(sf, "Checkpoint");
  dropUnusedWaygraphImport(sf, "checkpoint");
  // Checkpoints are now used as values: import them as values.
  const known = (n: string) => info.tags.has(n) || info.unions.has(n);
  for (const imp of sf.getImportDeclarations()) {
    if (imp.isTypeOnly() && /states/.test(imp.getModuleSpecifierValue()) && imp.getNamedImports().some((n) => known(n.getName()))) imp.setIsTypeOnly(false);
  }
  return { text: sf.getFullText(), skipped };
}

/** Runs the codemod over a project; returns the files changed and the calls it left alone. */
export function codemodCheckpoints(projectDir: string): { changed: string[]; skipped: string[] } {
  const info: StatesInfo = { tags: new Map(), unions: new Map() };
  const files = walkDir(projectDir, /\.ts$/).filter((f) => !f.endsWith(".d.ts"));
  const states = files.filter((f) => /\.states\.ts$|[/\\]_states\.ts$/.test(f));
  const changed: string[] = [];
  const skipped: string[] = [];
  for (const f of states) {
    const before = readFileSync(f, "utf8");
    const after = convertStates(before, info);
    if (after !== before) {
      writeFileSync(f, after);
      changed.push(relative(projectDir, f));
    }
  }
  for (const f of files.filter((x) => !states.includes(x))) {
    const before = readFileSync(f, "utf8");
    const { text, skipped: s } = convertBlocks(before, info);
    skipped.push(...s.map((c) => `${relative(projectDir, f)}: ${c}`));
    if (text !== before) {
      writeFileSync(f, text);
      changed.push(relative(projectDir, f));
    }
  }
  return { changed, skipped };
}
