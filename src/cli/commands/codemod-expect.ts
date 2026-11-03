// `waygraph upgrade --codemod expect`: from Assert Blocks as steps to expectations on the step they judge. Assert Blocks
// become Expect Blocks (`defineExpectBlock`, `ExpectBlock`); `.method(X).assert(A).assert(B)` becomes
// `.method(X, { expect: [A, B] })`, the same for `.gotoPage` / `.gotoExternal`; the `.expect(key, want)` step becomes
// `key.is(want)` (or `key.passes(test)`) in that list; `Trait.read(key, test)` becomes `key.passes(test)`. What it can't
// place (an assert with no step before it, a Layout) is listed for a person. Works on the TypeScript AST.
import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { CallExpression, SourceFile } from "ts-morph";
import { indentationOf } from "../../manifest/source.js";
import { walkDir } from "../../manifest/scan.js";

const RENAMES: Record<string, string> = { defineAssertBlock: "defineExpectBlock", AssertBlock: "ExpectBlock", AssertBlockOptions: "ExpectBlockOptions" };
const STEPS = new Set(["gotoPage", "gotoExternal", "method", "flow"]);

const calleeName = (call: Node | undefined): string | undefined => {
  if (!Node.isCallExpression(call)) return undefined;
  const callee = call.getExpression();
  return Node.isPropertyAccessExpression(callee) ? callee.getName() : undefined;
};
const receiverOf = (call: CallExpression): Node | undefined => {
  const callee = call.getExpression();
  return Node.isPropertyAccessExpression(callee) ? callee.getExpression() : undefined;
};

/** `.assert(A)` -> `A`; `.expect(key, want, wants?)` -> `key.is(want)` or `key.passes(test, wants)`. */
function expectation(call: CallExpression): string | undefined {
  const [first, second, third] = call.getArguments();
  if (!first) return undefined;
  if (calleeName(call) === "assert") return call.getArguments().length === 1 ? first.getText() : undefined;
  if (!second) return undefined;
  const fn = Node.isArrowFunction(second) || Node.isFunctionExpression(second);
  return `${first.getText()}.${fn ? "passes" : "is"}(${second.getText()}${third ? `, ${third.getText()}` : ""})`;
}

/** The step call with `item` added to its options' `expect` list. */
function withExpectation(step: CallExpression, item: string): string {
  const [block, opts] = step.getArguments();
  const receiver = receiverOf(step);
  const dot = step.getExpression().asKindOrThrow(SyntaxKind.PropertyAccessExpression).getNameNode().getStart() - 1;
  // The break between the chain and this step's dot, as written.
  const gap = receiver ? step.getSourceFile().getFullText().slice(receiver.getEnd(), dot) : "";
  const head = `${receiver?.getText()}${gap}.${calleeName(step)}(${block?.getText()}`;
  if (!opts) return `${head}, { expect: [${item}] })`;
  if (!Node.isObjectLiteralExpression(opts)) return "";
  const existing = opts.getProperty("expect");
  const list = Node.isPropertyAssignment(existing) ? existing.getInitializer() : undefined;
  if (Node.isArrayLiteralExpression(list)) {
    const items = [...list.getElements().map((e) => e.getText()), item].join(", ");
    return `${head}, ${opts.getText().replace(list.getText(), `[${items}]`)})`;
  }
  const inner = opts.getText().slice(1, -1).trim();
  return `${head}, { ${inner ? `${inner}, ` : ""}expect: [${item}] })`;
}

/** Folds each `.assert()` / `.expect()` into the step before it, one at a time; returns the text and what it left. */
export function convertExpectations(text: string): { text: string; left: { line: number; reason: string }[] } {
  const project = new Project({ useInMemoryFileSystem: true, manipulationSettings: { indentationText: indentationOf(text) } });
  for (;;) {
    const sf = project.createSourceFile("/file.ts", text, { overwrite: true });
    const fold = sf.getDescendantsOfKind(SyntaxKind.CallExpression).find((call) => {
      const name = calleeName(call);
      return (name === "assert" || name === "expect") && STEPS.has(calleeName(receiverOf(call)) ?? "") && expectation(call) !== undefined;
    });
    if (!fold) return { text: renamed(sf), left: leftovers(sf) };
    const step = receiverOf(fold) as CallExpression;
    const next = withExpectation(step, expectation(fold) as string);
    if (!next) return { text: renamed(sf), left: [...leftovers(sf), { line: fold.getStartLineNumber(), reason: "the step's options aren't an object literal" }] };
    text = text.slice(0, fold.getStart()) + next + text.slice(fold.getEnd());
  }
}

/** Renames Assert Block names and rewrites `Trait.read(key, test)`, on the final tree. */
function renamed(sf: SourceFile): string {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression).reverse()) {
    if (call.wasForgotten() || call.getExpression().getText() !== "Trait.read") continue;
    const [key, ...rest] = call.getArguments();
    if (key) call.replaceWithText(`${key.getText()}.passes(${rest.map((a) => a.getText()).join(", ")})`);
  }
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (!id.wasForgotten() && RENAMES[id.getText()]) id.replaceWithText(RENAMES[id.getText()] as string);
  }
  return sf.getFullText();
}

/** What's left for a person: an assert or expect step with nothing to attach to, and Layouts. */
function leftovers(sf: SourceFile): { line: number; reason: string }[] {
  const left: { line: number; reason: string }[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const name = calleeName(call);
    const receiver = calleeName(receiverOf(call));
    if ((name === "assert" || (name === "expect" && call.getArguments().length >= 2)) && receiver !== undefined) {
      left.push({ line: call.getStartLineNumber(), reason: `.${name}() after .${receiver}() - put it in the expect: [...] of the step it judges` });
    }
    if (call.getExpression().getText() === "defineLayout") {
      left.push({ line: call.getStartLineNumber(), reason: "a Layout - list its checks as Expect Blocks in the expect of the Blocks that land on those pages" });
    }
  }
  return left;
}

/** Runs `--codemod expect` over a project; returns the files changed and what's left by hand. */
export function codemodExpect(dir: string): { changed: string[]; problems: string[] } {
  const changed: string[] = [];
  const problems: string[] = [];
  for (const file of walkDir(dir, /\.ts$/).filter((f) => !f.endsWith(".d.ts"))) {
    const before = readFileSync(file, "utf8");
    if (!/defineAssertBlock|AssertBlock|\.assert\(|\.expect\(|Trait\.read|defineLayout/.test(before)) continue;
    const { text, left } = convertExpectations(before);
    problems.push(...left.map((l) => `${relative(dir, file)}:${l.line}: ${l.reason}`));
    if (text !== before) {
      writeFileSync(file, text);
      changed.push(relative(dir, file));
    }
  }
  return { changed, problems };
}
