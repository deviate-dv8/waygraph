// Part of `waygraph upgrade --codemod flows`: moves ctx stubs onto the one form each thing has in 0.16.0. The list-only
// `ctx.todos([...])` and its setters (`todoId`, `todoTitle`, `todoStyle`, `todoPos`, `todoIndex`) become
// `ctx.todos(id, items, { title, style, pos, index })`; `todoGroups(groups)` gets the same id and options; the method
// aliases (`banner`, `bannerPos`, `clearDevice`, `clearTodos`, `landscape`, `portrait`, `todoDockFull`) become the
// names they stood for. A stub written as a slot map (`{ email: { selector, label } }`) becomes a function of
// `ctx.ring` calls, and a stub set in a `define*Block({ ... })` (options or instruction) moves out to a chained
// `.stubBefore(...)` on the Block; a Block's `slides` become `ctx.slides(...)` in its chained `.stubAfter(...)`;
// `ctx.highlights({ a: ring })` becomes one `ctx.ring("a", ring)` per ring; `narrate(locator, caption, action)` in an
// `act` becomes the action, reported so the caption can move to a stubBefore ring. Last, everything a stub paints moves
// under `ctx.ui` (`ctx.ring(...)` -> `ctx.ui.ring(...)`). Works on the TypeScript AST (ts-morph).
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

const PHASES = new Set(["stubBefore", "stubAfter", "stubOnError"]);

/** A slot map as a stub function: `{ a: {...} }` -> `(ctx) => { ctx.ring("a", {...}); }`. */
function mapToStub(map: Node): string {
  if (!Node.isObjectLiteralExpression(map)) return map.getText();
  const rings = map.getProperties().flatMap((p) => (Node.isPropertyAssignment(p) ? [`ctx.ring(${JSON.stringify(p.getName().replace(/^["']|["']$/g, ""))}, ${p.getInitializerOrThrow().getText()});`] : []));
  return `(ctx) => {\n${rings.map((r) => "  " + r).join("\n")}\n}`;
}

/** `X.stubAfter({ ... })` -> `X.stubAfter((ctx) => { ctx.ring(...) })`. */
function convertSlotMaps(sf: SourceFile): boolean {
  let changed = false;
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression).reverse()) {
    if (call.wasForgotten()) continue;
    const callee = call.getExpression();
    const arg = call.getArguments()[0];
    if (Node.isPropertyAccessExpression(callee) && PHASES.has(callee.getName()) && Node.isObjectLiteralExpression(arg)) {
      arg.replaceWithText(mapToStub(arg));
      changed = true;
    }
  }
  return changed;
}

/** `defineXBlock({ ..., stubBefore: fn, slides })` (or in its instruction) -> `defineXBlock({ ... }).stubBefore(fn).stubAfter(slides)`. */
function hoistDefinitionStubs(sf: SourceFile): boolean {
  let changed = false;
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression).reverse()) {
    if (call.wasForgotten() || !/^define\w*Block$/.test(call.getExpression().getText())) continue;
    const options = call.getArguments()[0];
    if (!Node.isObjectLiteralExpression(options)) continue;
    const holders = [options];
    const instruction = options.getProperty("instruction");
    if (Node.isPropertyAssignment(instruction) && Node.isObjectLiteralExpression(instruction.getInitializer())) holders.push(instruction.getInitializer() as typeof options);
    const chained: string[] = [];
    let slides: string | undefined;
    for (const holder of holders) {
      for (const prop of holder.getProperties()) {
        const name = Node.isPropertyAssignment(prop) || Node.isMethodDeclaration(prop) ? prop.getName() : "";
        if (name === "slides" && Node.isPropertyAssignment(prop)) {
          const init = prop.getInitializerOrThrow();
          // `slides: (out) => [...]` read the Checkpoint the step reached; in stubAfter that is ctx.out.
          slides = Node.isArrowFunction(init) || Node.isFunctionExpression(init) ? `(${init.getText()})(ctx.out!)` : init.getText();
          prop.remove();
          continue;
        }
        if (!PHASES.has(name)) continue;
        let fn: string;
        if (Node.isMethodDeclaration(prop)) fn = `(${prop.getParameters().map((p) => p.getText()).join(", ")}) => ${prop.getBodyOrThrow().getText()}`;
        else {
          const init = (prop as import("ts-morph").PropertyAssignment).getInitializerOrThrow();
          fn = Node.isObjectLiteralExpression(init) ? mapToStub(init) : init.getText();
        }
        chained.push(`.${name}(${fn})`);
        prop.remove();
      }
    }
    if (slides !== undefined) {
      const after = chained.findIndex((c) => c.startsWith(".stubAfter("));
      if (after < 0) chained.push(`.stubAfter((ctx) => ctx.slides(${slides}))`);
      else {
        const fn = chained[after]!.slice(".stubAfter(".length, -1);
        chained[after] = `.stubAfter(async (ctx) => {\n  await (${fn})(ctx);\n  ctx.slides(${slides});\n})`;
      }
    }
    if (chained.length) {
      call.replaceWithText(call.getText() + chained.join(""));
      changed = true;
    }
  }
  return changed;
}

/** `ctx.highlights({ a: ring, b: ring })` -> `ctx.ring("a", ring); ctx.ring("b", ring);`, one call at a time. */
function convertHighlights(sf: SourceFile, problems: { line: number; reason: string }[]): boolean {
  let changed = false;
  const skipped = new Set<number>();
  for (;;) {
    // Raw text replacement forgets the file's nodes, so look the next call up again each time.
    const statement = sf.getDescendantsOfKind(SyntaxKind.ExpressionStatement).find((st) => {
      const c = ctxCall(st);
      return c && c.method === "highlights" && !skipped.has(st.getStart()) && isStubCtx(c.call, c.receiver);
    });
    if (!statement) return changed;
    const c = ctxCall(statement)!;
    const map = c.call.getArguments()[0];
    if (!Node.isObjectLiteralExpression(map)) {
      problems.push({ line: c.call.getStartLineNumber(), reason: "ctx.highlights(...) was removed and its argument is not an object literal: call ctx.ring(id, ring) for each ring" });
      skipped.add(statement.getStart());
      continue;
    }
    // Each ring keeps its own lines, moved to the statement's indent (replaceWithText would re-indent them).
    const column = (n: Node): number => n.getStart() - n.getStartLinePos();
    const indent = " ".repeat(column(statement));
    const rings = map.getProperties().flatMap((p) => {
      if (!Node.isPropertyAssignment(p)) return [];
      const from = column(p);
      const value = p.getInitializerOrThrow().getText().split("\n").map((l, n) => (n === 0 ? l : indent + l.slice(Math.min(from, l.search(/\S|$/))))).join("\n");
      return [`${c.receiver}.ring(${JSON.stringify(p.getName().replace(/^["']|["']$/g, ""))}, ${value});`];
    });
    sf.replaceText([statement.getStart(), statement.getEnd()], rings.join("\n" + indent));
    changed = true;
  }
}

/**
 * `narrate(locator, caption, () => action)` in an `act` -> just the action. The caption was narration inside the
 * Block; it belongs in a `stubBefore` ring where the flow uses the Block, which the codemod can't place, so it is
 * reported.
 */
function unwrapNarrate(sf: SourceFile, problems: { line: number; reason: string }[]): boolean {
  let changed = false;
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression).reverse()) {
    if (call.wasForgotten() || call.getExpression().getText() !== "narrate" || call.getArguments().length !== 3) continue;
    const [, captionNode, action] = call.getArguments();
    const caption = captionNode!.getText();
    const line = call.getStartLineNumber();
    let body = `(${action!.getText()})()`;
    if (Node.isArrowFunction(action) && !Node.isBlock(action.getBody())) body = action.getBody().getText();
    call.replaceWithText(body);
    problems.push({ line, reason: `narrate(...) was removed; its caption ${caption} is gone: ring the element in a stubBefore where the flow uses this Block` });
    changed = true;
  }
  if (changed) {
    for (const decl of sf.getImportDeclarations()) {
      const spec = decl.getNamedImports().find((n) => n.getName() === "narrate");
      if (!spec) continue;
      spec.remove();
      if (decl.getNamedImports().length === 0 && !decl.getDefaultImport() && !decl.getNamespaceImport()) decl.remove();
    }
  }
  return changed;
}

/** Everything a stub paints, which 0.16.3 moved under `ctx.ui`. */
const UI_METHODS = new Set(["ring", "todos", "todoIndex", "todoGroups", "hideTodos", "device", "viewport", "touch", "orientation", "hideDevice", "zoom", "zoomOut", "title", "titlePos", "bannerUi", "caption", "hideCaption", "slides", "hideBanner", "showNetworkTab", "hideNetworkTab", "todoDockUi"]);

/** Whether `name` at `node` is a stub's ctx: the nearest enclosing function with a parameter of that name is a stub. */
function isStubCtxName(node: Node, name: string): boolean {
  for (const fn of node.getAncestors()) {
    if (!(Node.isArrowFunction(fn) || Node.isFunctionExpression(fn) || Node.isFunctionDeclaration(fn) || Node.isMethodDeclaration(fn))) continue;
    const param = fn.getParameters().find((p) => p.getName() === name);
    if (!param) continue;
    if (/StubCtx/.test(param.getType().getText(param))) return true;
    const parent = fn.getParent();
    const callee = Node.isCallExpression(parent) ? parent.getExpression() : undefined;
    if (Node.isPropertyAccessExpression(callee) && /^stub(Before|After|OnError)$/.test(callee.getName())) return true;
    if (Node.isPropertyAssignment(parent) && /^stub(Before|After|OnError)$/.test(parent.getName())) return true;
    // `((ctx) => ...)(ctx)`, as the slides merge writes it: called at once with an outer stub's ctx.
    const call = Node.isParenthesizedExpression(parent) ? parent.getParent() : undefined;
    const arg = Node.isCallExpression(call) ? call.getArguments()[0] : undefined;
    return arg !== undefined && Node.isIdentifier(arg) && isStubCtxName(call!, arg.getText());
  }
  return false;
}

/** `ctx.ring(...)` -> `ctx.ui.ring(...)`, everywhere a stub's ctx paints (idempotent: `ctx.ui.ring` is left alone). */
function moveToUi(sf: SourceFile): boolean {
  let changed = false;
  for (const access of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).reverse()) {
    if (access.wasForgotten() || !UI_METHODS.has(access.getName())) continue;
    const receiver = access.getExpression();
    if (!Node.isIdentifier(receiver) || !isStubCtxName(access, receiver.getText())) continue;
    access.replaceWithText(`${receiver.getText()}.ui.${access.getName()}`);
    changed = true;
  }
  return changed;
}

/** Rewrites the old stub forms in every file; returns the files it changed and the calls left for a person. */
export function convertStubs(project: Project): { changed: SourceFile[]; problems: { file: string; line: number; reason: string }[] } {
  const changed: SourceFile[] = [];
  const problems: { file: string; line: number; reason: string }[] = [];
  for (const sf of project.getSourceFiles()) {
    const left: { line: number; reason: string }[] = [];
    let touched = hoistDefinitionStubs(sf);
    if (unwrapNarrate(sf, left)) touched = true;
    if (convertHighlights(sf, left)) touched = true;
    if (convertSlotMaps(sf)) touched = true;
    for (const block of sf.getDescendantsOfKind(SyntaxKind.Block).reverse()) {
      if (block.wasForgotten()) continue;
      if (convertStatements(block.getStatements(), left)) touched = true;
    }
    if (moveToUi(sf)) touched = true;
    if (touched) changed.push(sf);
    problems.push(...left.map((p) => ({ file: sf.getFilePath(), ...p })));
  }
  return { changed, problems };
}
