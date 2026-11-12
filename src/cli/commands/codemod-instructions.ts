// `waygraph upgrade --codemod instructions`: a Method written with `instruction: { act, verify, ... }` is written flat,
// `defineMethodBlock({ name, from, to, act, verify })`. A Method with `observe` and `resolve` gets one `lands(page, mem)`:
// its observe, every `return x` resolved. What can't be placed (an `instruction` that is a variable,
// an observe with no resolve) is listed and left as it was. Works on the TypeScript AST.
import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { ObjectLiteralExpression, ObjectLiteralElementLike } from "ts-morph";
import { indentationOf } from "../../manifest/source.js";
import { walkDir } from "../../manifest/scan.js";

/** The function a member is, as an expression: `resolve(seen) {}` / `resolve: (seen) => x`. */
function functionOf(member: ObjectLiteralElementLike | undefined): string | undefined {
  if (Node.isMethodDeclaration(member)) {
    return `${member.isAsync() ? "async " : ""}function (${member.getParameters().map((p) => p.getText()).join(", ")})${member.getReturnTypeNode() ? `: ${member.getReturnTypeNode()?.getText()}` : ""} ${member.getBody()?.getText() ?? "{}"}`;
  }
  if (Node.isPropertyAssignment(member)) return member.getInitializer()?.getText();
  return undefined;
}

/** `observe`'s parameters and body with every `return x` made `return resolve(x)`: observe and resolve in one. */
function landing(observe: ObjectLiteralElementLike): { params: string; body: string } | undefined {
  const fn = Node.isMethodDeclaration(observe) ? observe : Node.isPropertyAssignment(observe) ? observe.getInitializer() : undefined;
  if (!Node.isMethodDeclaration(fn) && !Node.isArrowFunction(fn) && !Node.isFunctionExpression(fn)) return undefined;
  const body = fn.getBody();
  if (!body) return undefined;
  const params = fn.getParameters().map((p) => p.getText()).join(", ");
  if (!Node.isBlock(body)) return { params, body: `{\n  return resolve(${body.getText()});\n}` };
  const start = body.getStart();
  let text = body.getText();
  const returns = body.getDescendantsOfKind(SyntaxKind.ReturnStatement).filter((r) => r.getFirstAncestor((a) => Node.isFunctionLikeDeclaration(a)) === fn);
  for (const r of returns.reverse()) {
    const value = r.getExpression();
    const at = r.getStart() - start;
    text = text.slice(0, at) + `return resolve(${value ? value.getText() : "undefined"});` + text.slice(r.getEnd() - start);
  }
  return { params, body: text };
}

/** Runs the codemod over a project's TypeScript (`src/`, `tests/`, `config/`). */
export function codemodInstructions(dir: string): { changed: string[]; problems: string[] } {
  const project = new Project({ useInMemoryFileSystem: true });
  const changed: string[] = [];
  const problems: string[] = [];
  for (const file of walkDir(dir, /\.ts$/).filter((f) => !f.includes("node_modules") && !f.endsWith(".d.ts"))) {
    const text = readFileSync(file, "utf8");
    if (!text.includes("defineMethodBlock")) continue;
    const unit = indentationOf(text);
    project.manipulationSettings.set({ indentationText: unit });
    const sf = project.createSourceFile(file, text, { overwrite: true });
    const step = unit === "\t" ? 1 : unit.length;
    let touched = false;
    // One call at a time, found afresh: a rewrite invalidates the nodes around it.
    for (let again = true; again; ) {
      again = false;
      for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        if (call.getExpression().getText() !== "defineMethodBlock") continue;
        const options = call.getArguments()[0];
        if (!Node.isObjectLiteralExpression(options)) continue;
        const prop = options.getProperty("instruction");
        if (!prop) continue;
        const nested = Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
        if (!Node.isObjectLiteralExpression(nested)) {
          problems.push(`${relative(dir, file)}: a Method's instruction isn't an object literal: write act/verify on the Method by hand`);
          continue;
        }
        const replacement = flattened(nested, step);
        if (typeof replacement === "string") {
          prop.replaceWithText(replacement);
          options.formatText({ indentSize: step, convertTabsToSpaces: unit !== "\t" });
          touched = true;
          again = true;
          break;
        }
        problems.push(`${relative(dir, file)}: ${replacement.problem}`);
      }
    }
    if (touched) {
      writeFileSync(file, sf.getFullText());
      changed.push(relative(dir, file));
    }
  }
  return { changed, problems: [...new Set(problems)] };
}

/** The members of an instruction as members of the Method (observe + resolve become `lands`), or why not. */
function flattened(instruction: ObjectLiteralExpression, step: number): string | { problem: string } {
  const members = instruction.getProperties();
  const named = (n: string) => members.find((m) => (Node.isPropertyAssignment(m) || Node.isMethodDeclaration(m)) && m.getName() === n);
  const observe = named("observe");
  const resolve = named("resolve");
  if (observe && !resolve) return { problem: "a Method with observe and no resolve: write its lands by hand" };
  const out = members
    .filter((m) => m !== observe && m !== resolve)
    .map((m) => m.getText());
  if (resolve) {
    let resolver = functionOf(resolve);
    // The observed value's type, from observe's `Promise<X>`, goes on resolve's parameter.
    const observed = Node.isMethodDeclaration(observe) ? observe.getReturnTypeNode()?.getText().match(/^Promise<(.*)>$/s)?.[1] : undefined;
    const arrow = Node.isPropertyAssignment(resolve) ? resolve.getInitializer() : undefined;
    const first = Node.isArrowFunction(arrow) ? arrow.getParameters()[0] : undefined;
    if (observed && first && !first.getTypeNode() && Node.isArrowFunction(arrow)) {
      resolver = `(${first.getText()}: ${observed}${arrow.getParameters().slice(1).map((p) => `, ${p.getText()}`).join("")}) => ${arrow.getBody().getText()}`;
    }
    if (!resolver) return { problem: "a Method whose resolve isn't a function: write its lands by hand" };
    const pad = " ".repeat(step);
    if (observe) {
      const merged = landing(observe);
      if (!merged) return { problem: "a Method whose observe isn't a function: write its lands by hand" };
      if (observed) {
        out.push(`async lands(${merged.params}) {\n${pad}const resolve = ${resolver};\n${pad}${merged.body.replace(/^\{\n?/, "").replace(/\n?\}$/, "").trim()}\n}`);
      } else {
        // Nothing says what observe gives: resolve is called on it right where it is, so its parameter is inferred.
        const observer = functionOf(observe);
        if (!observer) return { problem: "a Method whose observe isn't a function: write its lands by hand" };
        out.push(`async lands(page, mem) {\n${pad}const seen = await (${observer})(${["page", "mem"].slice(0, merged.params ? merged.params.split(",").length : 0).join(", ")});\n${pad}return (${resolver})(seen);\n}`);
      }
    } else {
      out.push(`async lands() {\n${pad}return (${resolver})(undefined);\n}`);
    }
  }
  return out.join(",\n");
}
