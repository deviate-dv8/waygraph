// Part of `waygraph upgrade --codemod flows`: moves ctx stubs onto the one form each thing has in 0.16.0. The list-only
// `ctx.todos([...])` and its setters (`todoId`, `todoTitle`, `todoStyle`, `todoPos`, `todoIndex`) become
// `ctx.todos(id, items, { title, style, pos, index })`; `todoGroups(groups)` gets the same id and options; the method
// aliases (`banner`, `bannerPos`, `clearDevice`, `clearTodos`, `landscape`, `portrait`, `todoDockFull`) become the
// names they stood for. Works on the TypeScript AST (ts-morph).
import { Node, SyntaxKind } from "ts-morph";
import type { CallExpression, ExpressionStatement, Project, SourceFile } from "ts-morph";

const RENAMED: Record<string, (args: string[]) => string> = {
  banner: (a) => `title(${a.join(", ")})`,
  bannerPos: (a) => `titlePos(${a.join(", ")})`,
  clearDevice: () => "hideDevice()",
  clearTodos: () => "hideTodos()",
  landscape: () => 'orientation("landscape")',
  portrait: () => 'orientation("portrait")',
  todoDockFull: () => "todoDockUi({ compact: false, collision: false, behindRing: false })",
};
/** The setters that fold into `todos(id, items, opts)`, and the option each one becomes. */
const DOCK_SETTERS: Record<string, string> = { todoId: "id", todoTitle: "title", todoStyle: "style", todoPos: "pos", todoIndex: "index" };
const DEFAULT_DOCK_ID = '"todos"';

/** `ctx.method(...)` as a statement on its own: the receiver, the method and the call. */
function ctxCall(statement: Node): { receiver: string; method: string; call: CallExpression } | undefined {
  if (!Node.isExpressionStatement(statement)) return undefined;
  const call = statement.getExpression();
  if (!Node.isCallExpression(call)) return undefined;
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee) || !Node.isIdentifier(callee.getExpression())) return undefined;
  return { receiver: callee.getExpression().getText(), method: callee.getName(), call };
}

/** Whether `receiver` is a stub's ctx: typed as StubCtx, or the first parameter of a function passed to a stub phase. */
function isStubCtx(call: CallExpression, receiver: string): boolean {
  const fn = call.getFirstAncestor((a) => Node.isArrowFunction(a) || Node.isFunctionExpression(a) || Node.isFunctionDeclaration(a) || Node.isMethodDeclaration(a));
  if (!fn || !(Node.isArrowFunction(fn) || Node.isFunctionExpression(fn) || Node.isFunctionDeclaration(fn) || Node.isMethodDeclaration(fn))) return false;
  const param = fn.getParameters()[0];
  if (!param || param.getName() !== receiver) return false;
  if (/StubCtx/.test(param.getType().getText(param))) return true;
  const parent = fn.getParent();
  const callee = Node.isCallExpression(parent) ? parent.getExpression() : undefined;
  if (Node.isPropertyAccessExpression(callee) && /^stub(Before|After|OnError)$/.test(callee.getName())) return true;
  return Node.isPropertyAssignment(parent) && /^stub(Before|After|OnError)$/.test(parent.getName());
}

/** Todo items written with the old `name` key get `id`. */
function renameItemNames(items: Node): void {
  for (const obj of items.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    const name = obj.getProperty("name");
    if (Node.isPropertyAssignment(name) && !obj.getProperty("id")) name.getNameNode().replaceWithText("id");
  }
}

/** Rewrites one statement list; returns whether anything changed and the calls it could not convert. */
function convertStatements(statements: readonly Node[], problems: { line: number; reason: string }[]): boolean {
  const calls = statements.map(ctxCall);
  let changed = false;
  const consumed = new Set<number>();
  calls.forEach((c, i) => {
    if (!c || !isStubCtx(c.call, c.receiver)) return;
    const args = c.call.getArguments().map((a) => a.getText());
    if (RENAMED[c.method]) {
      c.call.replaceWithText(`${c.receiver}.${RENAMED[c.method]!(args)}`);
      changed = true;
      return;
    }
    const isList = c.method === "todos" && c.call.getArguments().length === 1;
    if (!isList && c.method !== "todoGroups") return;
    if (c.method === "todoGroups" && c.call.getArguments().length !== 1) return;
    // The dock's setters in the same stub, before or after the list, fold into its options.
    const opts: Record<string, string> = {};
    calls.forEach((s, j) => {
      if (!s || s.receiver !== c.receiver || !DOCK_SETTERS[s.method]) return;
      if (s.method === "todoIndex" && c.method === "todoGroups") return;
      opts[DOCK_SETTERS[s.method]!] = s.call.getArguments()[0]?.getText() ?? "undefined";
      consumed.add(j);
    });
    const items = c.call.getArguments()[0]!;
    renameItemNames(items);
    const id = opts.id ?? DEFAULT_DOCK_ID;
    delete opts.id;
    const entries = Object.entries(opts);
    const tail = entries.length ? `, { ${entries.map(([k, v]) => `${k}: ${v}`).join(", ")} }` : "";
    c.call.replaceWithText(`${c.receiver}.${c.method}(${id}, ${items.getText()}${tail})`);
    changed = true;
  });
  for (const i of [...consumed].sort((a, b) => b - a)) (statements[i] as ExpressionStatement).remove();
  for (const [i, c] of calls.entries()) {
    if (!c || consumed.has(i) || c.call.wasForgotten() || !isStubCtx(c.call, c.receiver)) continue;
    if (DOCK_SETTERS[c.method] && c.method !== "todoIndex") problems.push({ line: c.call.getStartLineNumber(), reason: `ctx.${c.method}() with no ctx.todos(...) beside it: pass it as an option of ctx.todos(id, items, { ... })` });
    if (c.method === "set") problems.push({ line: c.call.getStartLineNumber(), reason: "ctx.set({...}) was removed: call ctx.ring / ctx.todos / ctx.title ... instead" });
  }
  return changed;
}

/** Rewrites the old stub forms in every file; returns the files it changed and the calls left for a person. */
export function convertStubs(project: Project): { changed: SourceFile[]; problems: { file: string; line: number; reason: string }[] } {
  const changed: SourceFile[] = [];
  const problems: { file: string; line: number; reason: string }[] = [];
  for (const sf of project.getSourceFiles()) {
    const left: { line: number; reason: string }[] = [];
    let touched = false;
    for (const block of sf.getDescendantsOfKind(SyntaxKind.Block).reverse()) {
      if (block.wasForgotten()) continue;
      if (convertStatements(block.getStatements(), left)) touched = true;
    }
    if (touched) changed.push(sf);
    problems.push(...left.map((p) => ({ file: sf.getFilePath(), ...p })));
  }
  return { changed, problems };
}
