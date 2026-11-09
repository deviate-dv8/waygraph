// `waygraph check`: checks in the right home. A Block's verify says it arrived and its action took effect; what a
// scenario expects is an expectation (an Expect Block, `Key.is(...)`), which only reads. These find the two mixed up,
// and an expectation that acts on the page.
import { Node, SyntaxKind } from "ts-morph";
import type { CallExpression, SourceFile } from "ts-morph";

export type ExpectKind = "mutating-expectation" | "arrival-in-expect" | "outcome-in-verify" | "expect-one-read";

export interface ExpectFinding {
  kind: ExpectKind;
  detail: string;
}

const ACTIONS = new Set(["click", "dblclick", "tap", "fill", "type", "press", "pressSequentially", "clear", "check", "uncheck", "selectOption", "setInputFiles", "hover", "dragTo", "goto", "reload", "goBack", "goForward"]);
const ARRIVAL = new Set(["Trait.url", "Trait.visible"]);
const OUTCOME = new Set(["Trait.text", "Trait.contains", "Trait.matches"]);
/** A selector that names a message: what a scenario expects to read, not proof the step arrived. */
const MESSAGE = /toast|alert|notif|message|snackbar|banner|error/i;

const callsTo = (sf: SourceFile, name: string): CallExpression[] =>
  sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((c) => c.getExpression().getText() === name);

/** The checks a define call's `verify` lists, by callee (`Trait.text`), or undefined when it isn't a literal list. */
function verifyCallees(call: CallExpression): string[] | undefined {
  return verifyItems(call)?.map((e) => (Node.isCallExpression(e) ? e.getExpression().getText() : e.getText()));
}

/** The items a define call's `verify` lists, or undefined when it isn't a literal list. */
function verifyItems(call: CallExpression): Node[] | undefined {
  const options = call.getArguments()[0];
  if (!Node.isObjectLiteralExpression(options)) return undefined;
  const direct = options.getProperty("verify");
  const nested = options.getProperty("instruction");
  const inInstruction = Node.isPropertyAssignment(nested) ? nested.getInitializer() : undefined;
  const verify = Node.isPropertyAssignment(direct)
    ? direct
    : Node.isObjectLiteralExpression(inInstruction)
      ? inInstruction.getProperty("verify")
      : undefined;
  const list = Node.isPropertyAssignment(verify) ? verify.getInitializer() : undefined;
  if (!Node.isArrayLiteralExpression(list)) return undefined;
  return list.getElements();
}

/**
 * A Method whose verify reads a message (a toast, an alert, an error): what a scenario expects, not proof the
 * step took effect. A text check on anything else (a count, a field) can be the Block's own contract.
 */
function outcomeInVerify(sf: SourceFile): string | undefined {
  for (const call of callsTo(sf, "defineMethodBlock")) {
    for (const item of verifyItems(call) ?? []) {
      if (!Node.isCallExpression(item) || !OUTCOME.has(item.getExpression().getText())) continue;
      if (MESSAGE.test(item.getArguments()[0]?.getText() ?? "")) return item.getText().slice(0, 80);
    }
  }
  return undefined;
}

/** What one file does with checks that belongs somewhere else. */
export function expectFindings(sf: SourceFile): ExpectFinding[] {
  const found: ExpectFinding[] = [];
  const expectBlocks = callsTo(sf, "defineExpectBlock");
  const acting = expectBlocks.flatMap((call) =>
    call.getDescendantsOfKind(SyntaxKind.CallExpression).filter((c) => {
      const callee = c.getExpression();
      return (Node.isPropertyAccessExpression(callee) && ACTIONS.has(callee.getName())) || callee.getText() === "mem.set";
    }),
  );
  if (acting[0]) {
    found.push({
      kind: "mutating-expectation",
      detail:
        `an Expect Block calls ${acting[0].getExpression().getText()}() - an expectation only reads and judges (it fails when it acts). ` +
        "Make the action a Method step before it, and let the expectation read what it left",
    });
  }
  if (expectBlocks.some((call) => (verifyCallees(call) ?? [""]).every((c) => ARRIVAL.has(c)))) {
    found.push({
      kind: "arrival-in-expect",
      detail:
        "an Expect Block that only checks the URL or that something is visible - that's where the page is, not what the scenario " +
        "expects: put it in the verify of the Block that lands there",
    });
  }
  const outcome = outcomeInVerify(sf);
  if (outcome) {
    found.push({
      kind: "outcome-in-verify",
      detail:
        `a Method's verify judges what its action produced (${outcome}) - verify says the step arrived and took effect, true in every ` +
        "flow that uses it; what a scenario expects (a message, a toast) goes in expect: [...] on the step, or the Block's expect when every use expects it",
    });
  }
  if (expectBlocks.some((call) => { const c = verifyCallees(call); return c?.length === 1 && /\.(is|passes)$/.test(c[0] ?? ""); })) {
    found.push({ kind: "expect-one-read", detail: "an Expect Block that is one read check - say it in place: expect: [Key.is(value)] or [Key.passes((v, mem) => ...)]" });
  }
  return found;
}
