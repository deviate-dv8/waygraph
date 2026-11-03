// `waygraph check`: code a project wrote for something waygraph already does. Each warning names what to use instead.
// Read from the syntax tree of every .ts file in the project (Blocks, flows, helpers, specs), not only Block files.
import { Node, SyntaxKind } from "ts-morph";
import type { CallExpression, SourceFile } from "ts-morph";
import { parseSource } from "../manifest/source.js";

export type BuiltInKind = "cast-to-outcome" | "ff-run" | "hand-rolled-retry" | "seeded-spec" | "builder-helper" | "overlay-workaround" | "start-tag";

export interface BuiltInFinding {
  kind: BuiltInKind;
  detail: string;
}

const OUTCOME_CAST = /^(?:MethodBlock|EffectBlock|NavBlock|PageBlock)</;

/** `X as MethodBlock<A, B>`: narrowing a branching Block to one outcome by hand. */
function castToOutcome(sf: SourceFile): string | undefined {
  const cast = sf.getDescendantsOfKind(SyntaxKind.AsExpression).find((a) => OUTCOME_CAST.test(a.getTypeNode()?.getText() ?? ""));
  if (!cast) return undefined;
  return (
    `\`${cast.getText().slice(0, 80)}\` narrows a Block to one outcome by a cast, which nothing checks at runtime - ` +
    "write the step as .method(Block, { lands: Checkpoint }): the flow is typed from it, and a run that lands elsewhere fails at that step"
  );
}

/** A call with `{ ff: true }` among its arguments (a step fast-forwarded on its own). */
export const hasFfTrue = (call: Node | undefined): call is CallExpression =>
  Node.isCallExpression(call) &&
  call.getArguments().some(
    (a) => Node.isObjectLiteralExpression(a) && a.getProperties().some((p) => Node.isPropertyAssignment(p) && p.getName() === "ff" && p.getInitializer()?.getText() === "true"),
  );

/** The longest run of chained steps that each pass `{ ff: true }`. */
function longestFfRun(sf: SourceFile): number {
  let longest = 0;
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (!hasFfTrue(call)) continue;
    // Count down the chain from the outermost call of a run only.
    const parent = call.getParent()?.getParent();
    if (Node.isCallExpression(parent) && hasFfTrue(parent)) continue;
    let run = 0;
    let at: Node | undefined = call;
    while (Node.isCallExpression(at) && hasFfTrue(at)) {
      run++;
      const callee: Node = at.getExpression();
      at = Node.isPropertyAccessExpression(callee) ? callee.getExpression() : undefined;
    }
    longest = Math.max(longest, run);
  }
  return longest;
}

/** A loop that polls against the clock and sleeps, in a file about Traits: a check retried by hand. */
function handRolledRetry(sf: SourceFile): boolean {
  if (!sf.getDescendantsOfKind(SyntaxKind.Identifier).some((i) => i.getText() === "Trait")) return false;
  const loops = [
    ...sf.getDescendantsOfKind(SyntaxKind.ForStatement),
    ...sf.getDescendantsOfKind(SyntaxKind.WhileStatement),
    ...sf.getDescendantsOfKind(SyntaxKind.DoStatement),
  ];
  return loops.some((loop) => {
    const calls = loop.getDescendantsOfKind(SyntaxKind.CallExpression).map((c) => c.getExpression().getText());
    const sleeps = calls.some((c) => c === "setTimeout" || c === "sleep" || c.endsWith(".waitForTimeout"));
    return sleeps && /Date\.now\(\)|performance\.now\(\)/.test(loop.getText());
  });
}

/** `(b: MapBuilder<…>) => b.gotoPage(…)…`: a shared run of steps written as a function over the builder. */
const builderHelper = (sf: SourceFile): boolean =>
  sf.getDescendantsOfKind(SyntaxKind.TypeReference).some((t) => t.getTypeName().getText() === "MapBuilder");

/** Workarounds for the demo overlay taking a click or a date-time fill, which it no longer does. */
function overlayWorkaround(sf: SourceFile): string | undefined {
  const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression);
  const literal = (c: CallExpression) => c.getArguments()[0]?.getText().replace(/['"`]/g, "");
  if (calls.some((c) => c.getExpression().getText().endsWith(".dispatchEvent") && literal(c) === "click")) {
    return "dispatches a click event instead of clicking: the demo overlay lets every step's click through to the page, so locator.click() works in a demo as in a run";
  }
  if (calls.some((c) => c.getExpression().getText() === "Object.getOwnPropertyDescriptor" && c.getArguments()[0]?.getText() === "HTMLInputElement.prototype")) {
    return "sets an input's value through its native setter: locator.fill() works on date, time and datetime-local fields in a demo as in a run";
  }
  return undefined;
}

/** What one file does by hand that waygraph already does. */
export function builtInFindings(file: string, sf: SourceFile = parseSource(file)): BuiltInFinding[] {
  const found: BuiltInFinding[] = [];
  const cast = castToOutcome(sf);
  if (cast) found.push({ kind: "cast-to-outcome", detail: cast });
  const run = longestFfRun(sf);
  if (run >= 3) {
    found.push({ kind: "ff-run", detail: `${run} steps in a row pass { ff: true } - bracket them with .ffStart() ... .ffEnd() (one fast-forward, one place to change)` });
  }
  if (handRolledRetry(sf)) {
    found.push({
      kind: "hand-rolled-retry",
      detail:
        "a loop polls against the clock and sleeps - a Trait is already retried until it passes or its timeoutMs runs out, " +
        "and a failure says what it wanted and saw: return { ok, saw } from check() and set wants",
    });
  }
  if (/\.spec\.ts$/.test(file) && sf.getDescendantsOfKind(SyntaxKind.CallExpression).some((c) => c.getExpression().getText() === "seedMemStub")) {
    found.push({
      kind: "seeded-spec",
      detail:
        "seeds mem stubs by hand before flow.run() - a flow with map({ memStub: true }) (or new Engine({ memStub: true })) fills them " +
        "when it runs, `waygraph test` runs flows without a spec file, and who signs in is an account: map({ as: Planner })",
    });
  }
  if (builderHelper(sf)) {
    found.push({
      kind: "builder-helper",
      detail:
        "a function over MapBuilder shares a run of steps - write it as a part, steps(Checkpoint, (m) => m...), played with .steps(part); " +
        "for signing in, account(name, { signIn }) and map({ as }) also keep the session between flows",
    });
  }
  const overlay = overlayWorkaround(sf);
  if (overlay) found.push({ kind: "overlay-workaround", detail: overlay });
  const literals = [...sf.getDescendantsOfKind(SyntaxKind.StringLiteral), ...sf.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)];
  if (literals.some((l) => l.getLiteralValue() === "__start__")) {
    found.push({ kind: "start-tag", detail: 'spells the start Checkpoint\'s tag ("__start__") - import { Start } from "waygraph": from: Start, to: Start, Block<Start, Home>' });
  }
  return found;
}
