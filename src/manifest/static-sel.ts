// A `_sel.ts` entry written with the typed builders (`sel.role("button", { name: "Login" })`) is a fixed selector too: worked out
// from the source, without running the project, so the manifest and Pilot's coverage see its string as they see a plain one.
import { Node } from "ts-morph";
import { sel } from "../engine/trait/selector.js";

const builders = sel as unknown as Record<string, ((...args: unknown[]) => string) | undefined>;
const NOT_FIXED = Symbol("not fixed");

/** The value of a literal (a string, number, boolean, regex, or an object or `sel.*` call of those), or NOT_FIXED. */
function valueOf(node: Node): unknown {
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) return node.getLiteralValue();
  if (Node.isNumericLiteral(node)) return node.getLiteralValue();
  if (Node.isTrueLiteral(node)) return true;
  if (Node.isFalseLiteral(node)) return false;
  if (Node.isRegularExpressionLiteral(node)) {
    const text = node.getText();
    const end = text.lastIndexOf("/");
    return new RegExp(text.slice(1, end), text.slice(end + 1));
  }
  if (Node.isObjectLiteralExpression(node)) {
    const out: Record<string, unknown> = {};
    for (const property of node.getProperties()) {
      if (!Node.isPropertyAssignment(property)) return NOT_FIXED;
      const initializer = property.getInitializer();
      const value = initializer ? valueOf(initializer) : NOT_FIXED;
      if (value === NOT_FIXED) return NOT_FIXED;
      out[property.getName().replace(/^["']|["']$/g, "")] = value;
    }
    return out;
  }
  if (Node.isCallExpression(node)) return callOf(node) ?? NOT_FIXED;
  return NOT_FIXED;
}

/** What a `sel.<builder>(…)` call with fixed arguments builds, or undefined when it is anything else. */
function callOf(call: Node): string | undefined {
  if (!Node.isCallExpression(call)) return undefined;
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee) || callee.getExpression().getText() !== "sel") return undefined;
  const build = builders[callee.getName()];
  if (!build) return undefined;
  const args = call.getArguments().map(valueOf);
  if (args.includes(NOT_FIXED)) return undefined;
  try {
    return build(...args);
  } catch {
    return undefined;
  }
}

/** The selector a `sel.*` call with fixed arguments builds, from its source. */
export function staticSelector(node: Node | undefined): string | undefined {
  return node ? callOf(node) : undefined;
}
