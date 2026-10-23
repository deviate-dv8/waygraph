// `waygraph upgrade --codemod flows`: rewrites `defineFlow([start, ...Blocks, end], options)`, `chainFlow(...)` and the
// flow wrappers (`withTitle`, `withMemStub`, `withSessionReset`, `withExpectedFailure`, `withDemoPace`,
// `withHighlightStyle`, `withBlockPace`, `withStub*`) into `map()` chains. Works on the TypeScript AST (ts-morph); each
// Block's kind (nav, method, assert, ...) comes from the project's own runtime scan, so it picks the right step method.
// The same pass moves ctx stubs onto their one form (codemod-stubs.ts).
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { CallExpression, Expression, SourceFile } from "ts-morph";
import { scanProject } from "../../manifest/project.js";
import { walkDir } from "../../manifest/scan.js";
import { convertStubs } from "./codemod-stubs.js";

/** A Block's kind by the file and export it is declared in; undefined when it isn't a known Block. */
export type KindOf = (file: string, exportName: string) => string | undefined;

const SETTINGS: Record<string, (arg: string | undefined) => string> = {
  withMemStub: () => "memStub: true",
  withSessionReset: () => "sessionReset: true",
  withExpectedFailure: (a) => `expectedFailure: ${a}`,
  withDemoPace: (a) => `demoPace: ${a}`,
  withHighlightStyle: (a) => `highlightStyle: ${a}`,
};
const STUBS: Record<string, string> = { withStubBefore: "stubBefore", withStubAfter: "stubAfter", withStubOnError: "stubOnError" };
const REMOVED = new Set(["start", "end", "chainFlow", "withTitle", "withBlockPace", "withHighlightFixtures", ...Object.keys(SETTINGS), ...Object.keys(STUBS)]);
const STEP: Record<string, string> = { nav: "gotoPage", page: "gotoPage", method: "method", effect: "method", api: "method", assert: "assert" };

/** The Block identifier an element of a flow is built from: `X`, `X.stubBefore(...)`, `withVerify(X, ...)`. */
function rootIdentifier(expr: Node): Node | undefined {
  if (Node.isIdentifier(expr)) return expr;
  if (Node.isCallExpression(expr)) {
    const callee = expr.getExpression();
    if (Node.isPropertyAccessExpression(callee)) return rootIdentifier(callee.getExpression());
    if (Node.isIdentifier(callee) && callee.getText() === "withVerify") return expr.getArguments()[0] && rootIdentifier(expr.getArguments()[0]!);
  }
  return undefined;
}

/** Where an identifier is declared: its file and exported name, following imports. */
function declarationOf(id: Node): { file: string; name: string } | undefined {
  let symbol = id.getSymbol();
  if (!symbol) return undefined;
  if (symbol.isAlias()) symbol = symbol.getAliasedSymbol() ?? symbol;
  const decl = symbol.getDeclarations()[0];
  if (!decl) return undefined;
  return { file: decl.getSourceFile().getFilePath(), name: symbol.getName() };
}

/** `engine.map({...}).start()...end()`: the `.map(...)` call at the root of a chain, or undefined. */
function mapCallOf(expr: Node): CallExpression | undefined {
  let cur: Node = expr;
  while (Node.isCallExpression(cur)) {
    const callee = cur.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) return undefined;
    if (callee.getName() === "map") return cur;
    cur = callee.getExpression();
  }
  return undefined;
}

/** The first step call after `.map(...)`/`.start()` in a chain. */
function firstStepOf(mapCall: CallExpression): CallExpression | undefined {
  let parent: Node | undefined = mapCall.getParent();
  while (parent && Node.isPropertyAccessExpression(parent)) {
    const call = parent.getParent();
    if (!call || !Node.isCallExpression(call)) return undefined;
    if (parent.getName() !== "start") return call;
    parent = call.getParent();
  }
  return undefined;
}

function addSetting(mapCall: CallExpression, setting: string): void {
  const arg = mapCall.getArguments()[0];
  if (arg && Node.isObjectLiteralExpression(arg)) {
    const inner = arg.getText().slice(1, -1).trim().replace(/,$/, "");
    arg.replaceWithText(`{ ${inner ? `${inner}, ` : ""}${setting} }`);
  } else if (!arg) {
    mapCall.addArgument(`{ ${setting} }`);
  } else {
    arg.replaceWithText(`{ ...${arg.getText()}, ${setting} }`);
  }
}

function addTitle(step: CallExpression, title: string): void {
  const block = step.getArguments()[0];
  if (block) block.replaceWithText(titleStub(block.getText(), title, indentOf(step)));
}

/** `engine` when the file has one in scope, else the standalone `map` export (imported from waygraph). */
function mapRoot(sf: SourceFile, needsMap: Set<SourceFile>): string {
  const hasEngine = sf.getImportDeclarations().some((d) => d.getNamedImports().some((n) => (n.getAliasNode()?.getText() ?? n.getName()) === "engine"))
    || sf.getVariableDeclaration("engine") !== undefined;
  if (hasEngine) return "engine.map";
  needsMap.add(sf);
  return "map";
}

/** The indentation of the statement a node sits in, so a rewritten chain lines up with the code around it. */
function indentOf(node: Node): string {
  const statement = node.getFirstAncestor((a) => Node.isStatement(a) || Node.isSourceFile(a.getParentOrThrow())) ?? node;
  return " ".repeat(statement.getIndentationLevel() * 2);
}

function titleStub(block: string, title: string, indent: string): string {
  return `${block}.stubBefore((ctx) => {\n${indent}    ctx.title(${title});\n${indent}  })`;
}

function chain(head: string, steps: string[], indent: string): string {
  return [head, ...steps, ".end()"].join(`\n${indent}  `);
}

/** Rewrites one call if it is one of the old forms; returns a problem message when it can't. */
function rewrite(call: CallExpression, kindOf: KindOf, needsMap: Set<SourceFile>): "changed" | string | undefined {
  const sf = call.getSourceFile();
  const callee = call.getExpression();
  const args = call.getArguments();
  const name = Node.isIdentifier(callee) ? callee.getText() : undefined;
  const indent = indentOf(call);

  if (Node.isPropertyAccessExpression(callee) && callee.getName() === "defineFlow") {
    const list = args[0];
    if (!list || !Node.isArrayLiteralExpression(list)) return "defineFlow without an array literal";
    const elements = list.getElements().filter((e) => e.getText() !== "start" && e.getText() !== "end");
    const steps: string[] = [];
    for (const el of elements) {
      let block: Node = el;
      let opts = "";
      if (Node.isCallExpression(el) && el.getExpression().getText() === "withBlockPace") {
        block = el.getArguments()[0]!;
        opts = `, { pace: ${el.getArguments()[1]?.getText()} }`;
      }
      const id = rootIdentifier(block);
      const decl = id && declarationOf(id);
      const kind = decl && kindOf(decl.file, decl.name);
      const step = kind && STEP[kind];
      if (!step) return `${el.getText().split("\n")[0]} is not a Block from a define*Block factory (kind: ${kind ?? "unknown"}); map() can't take it - rebuild it with a factory or nest it with .flow()`;
      const external = step === "gotoPage" && /[\\/]\(external\)[\\/]/.test(decl!.file);
      steps.push(`.${external ? "gotoExternal" : step}(${block.getText()}${opts})`);
    }
    const options = args[1];
    let settings = "";
    let title: string | undefined;
    if (options) {
      if (!Node.isObjectLiteralExpression(options)) return "defineFlow options that aren't an object literal";
      const kept: string[] = [];
      for (const p of options.getProperties()) {
        if (Node.isPropertyAssignment(p) && p.getName() === "title") title = p.getInitializer()!.getText();
        else kept.push(p.getText());
      }
      if (kept.length) settings = `{ ${kept.join(", ")} }`;
    }
    if (title && steps[0]) steps[0] = steps[0].replace(/^(\.\w+\()(.*)\)$/s, (_all, head: string, block: string) => `${head}${titleStub(block, title!, indent)})`);
    call.replaceWithText(chain(`${callee.getExpression().getText()}.map(${settings})`, [".start()", ...steps], indent));
    return "changed";
  }

  if (name === "chainFlow") {
    call.replaceWithText(chain(`${mapRoot(sf, needsMap)}()`, [".start()", ...args.map((a) => `.flow(${a.getText()})`)], indent));
    return "changed";
  }

  if (name && STUBS[name] && args.length === 2) {
    call.replaceWithText(`${args[0]!.getText()}.${STUBS[name]}(${args[1]!.getText()})`);
    return "changed";
  }

  if (name && (SETTINGS[name] || name === "withTitle") && args[0]) {
    const flow = args[0] as Expression;
    const mapCall = mapCallOf(flow);
    if (name === "withTitle") {
      const first = mapCall && firstStepOf(mapCall);
      if (!first) return `withTitle(${flow.getText().split("\n")[0]}, …): name the flow with ctx.title(…) in a stub on its first step`;
      addTitle(first, args[1]!.getText());
    } else if (mapCall) {
      addSetting(mapCall, SETTINGS[name]!(args[1]?.getText()));
    } else {
      call.replaceWithText(chain(`${mapRoot(sf, needsMap)}({ ${SETTINGS[name]!(args[1]?.getText())} })`, [".start()", `.flow(${flow.getText()})`], indent));
      return "changed";
    }
    call.replaceWithText(flow.getText());
    return "changed";
  }

  if (name === "withHighlightFixtures") return "withHighlightFixtures: chain ctx stubs on each Block where the flow uses it (Block.stubAfter((ctx) => …))";
  if (name === "withBlockPace") return "withBlockPace outside a flow: use the step option .method(Block, { pace })";

  if (Node.isPropertyAccessExpression(callee) && callee.getName() === "end" && args[0] && mapCallOf(call)) {
    const options = args[0];
    if (Node.isObjectLiteralExpression(options)) {
      const mapCall = mapCallOf(call)!;
      for (const p of options.getProperties()) addSetting(mapCall, p.getText());
      options.replaceWithText("");
      call.replaceWithText(call.getText().replace(/\.end\(\s*\)$/, ".end()"));
      return "changed";
    }
  }
  return undefined;
}

/** Rewrites the old flow forms in a project's source files; returns problems it left for a person. */
export function convertFlows(project: Project, kindOf: KindOf): { changed: SourceFile[]; problems: { file: string; line: number; reason: string }[] } {
  const changed = new Set<SourceFile>();
  const problems: { file: string; line: number; reason: string }[] = [];
  const needsMap = new Set<SourceFile>();
  for (const sf of project.getSourceFiles()) {
    // One rewrite per pass, innermost calls first, so a wrapper sees the map() chain its argument became. Calls left
    // for a person never change, so the final pass (nothing left to rewrite) lists each of them once.
    const rewritten = new Set<number>();
    for (;;) {
      let progressed = false;
      const left: typeof problems = [];
      for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression).reverse()) {
        if (call.wasForgotten()) continue;
        const top = sf.getStatements().indexOf(call.getFirstAncestor((a) => a.getParent() === sf) as never);
        const result = rewrite(call, kindOf, needsMap);
        if (result === "changed") {
          changed.add(sf);
          rewritten.add(top);
          progressed = true;
          break;
        }
        if (result) left.push({ file: sf.getFilePath(), line: call.getStartLineNumber(), reason: result });
      }
      if (!progressed) {
        problems.push(...left.reverse());
        break;
      }
    }
    if (!changed.has(sf)) continue;
    // Replacing nested calls leaves odd indentation behind; TypeScript's formatter tidies just the rewritten statements.
    const statements = sf.getStatements();
    for (const i of rewritten) statements[i]?.formatText({ indentSize: 2, convertTabsToSpaces: true });
    for (const imp of sf.getImportDeclarations()) {
      if (imp.getModuleSpecifierValue() !== "waygraph") continue;
      for (const n of imp.getNamedImports()) {
        const local = n.getAliasNode()?.getText() ?? n.getName();
        const stillUsed = sf.getDescendantsOfKind(SyntaxKind.Identifier).some((i) => {
          const parent = i.getParent();
          if (i.getText() !== local || Node.isImportSpecifier(parent)) return false;
          return !(Node.isPropertyAccessExpression(parent) && parent.getNameNode() === i);
        });
        if (REMOVED.has(n.getName()) && !stillUsed) n.remove();
      }
      if (needsMap.has(sf) && !imp.getNamedImports().some((n) => n.getName() === "map")) imp.addNamedImport("map");
      if (imp.getNamedImports().length === 0 && !imp.getDefaultImport() && !imp.getNamespaceImport()) imp.remove();
    }
  }
  return { changed: [...changed], problems };
}

/** Runs the codemod over a project's TypeScript files, using its runtime scan for each Block's kind. */
export async function codemodFlows(projectDir: string): Promise<{ changed: string[]; problems: string[] }> {
  const scan = await scanProject(projectDir, { flows: false, maps: false });
  const kinds = new Map(scan.blocks.map((b) => [`${b.absFile}#${b.exportName}`, b.kind]));
  // Compiler options from the project's tsconfig; files from walkDir, which skips node_modules, dist and .git.
  const tsconfig = join(projectDir, "tsconfig.json");
  const project = new Project({ ...(existsSync(tsconfig) ? { tsConfigFilePath: tsconfig } : {}), skipAddingFilesFromTsConfig: true });
  for (const file of walkDir(projectDir, /\.ts$/)) if (!file.endsWith(".d.ts")) project.addSourceFileAtPath(file);
  const flows = convertFlows(project, (file, name) => kinds.get(`${file}#${name}`));
  const stubs = convertStubs(project);
  const changed = [...new Set([...flows.changed, ...stubs.changed])];
  const problems = [...flows.problems, ...stubs.problems];
  for (const sf of changed) sf.saveSync();
  return {
    changed: changed.map((sf) => relative(projectDir, sf.getFilePath())),
    problems: problems.map((p) => `${relative(projectDir, p.file)}:${p.line}: ${p.reason}`),
  };
}
