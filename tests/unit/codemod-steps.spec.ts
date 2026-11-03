import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { codemodLands, convertChainEnds, convertFfRuns } from "../../src/cli/commands/codemod-steps.js";

describe("--codemod ff", () => {
  it("brackets three or more { ff: true } steps with .ffStart() / .ffEnd(), keeping the other options", () => {
    const before = [
      "const signIn = (b) =>",
      "  b",
      "    .gotoPage(NavLoginBlock, { ff: true })",
      "    .method(FillEmailBlock, { ff: true, pace: \"fast\" })",
      "    .method(SubmitBlock, { ff: true });",
      "const short = map().method(A, { ff: true }).method(B, { ff: true });",
      "",
    ].join("\n");
    const after = [
      "const signIn = (b) =>",
      "  b",
      "    .ffStart()",
      "    .gotoPage(NavLoginBlock)",
      "    .method(FillEmailBlock, { pace: \"fast\" })",
      "    .method(SubmitBlock)",
      "    .ffEnd();",
      "const short = map().method(A, { ff: true }).method(B, { ff: true });",
      "",
    ].join("\n");
    assert.equal(convertFfRuns(before), after);
  });

  it("two runs in one file", () => {
    const step = ".method(X, { ff: true })";
    const out = convertFfRuns(`a${step.repeat(3)}.method(Y);\nb${step.repeat(4)};\n`);
    assert.equal(out, `a.ffStart()${".method(X)".repeat(3)}.ffEnd().method(Y);\nb.ffStart()${".method(X)".repeat(4)}.ffEnd();\n`);
  });
});

describe("--codemod chain", () => {
  it("drops a flow's .start() and .end(), in branch routes too, and leaves other .start() / .end() alone", () => {
    const before = [
      "export const f = engine",
      "  .map({ as: Planner })",
      "  .start()",
      "  .gotoPage(NavHomeBlock)",
      "  .method(AddItemBlock)",
      "  .end();",
      "export const g = map().gotoPage(NavLoginBlock).method(SubmitBlock).branch({",
      "  LoggedIn: (m) => m.gotoPage(NavCartBlock).end(),",
      "  LoginPage: (m) => m.end(),",
      "});",
      "res.end();",
      "timer.start();",
      "items.map((x) => x).join();",
      "",
    ].join("\n");
    const after = [
      "export const f = engine",
      "  .map({ as: Planner })",
      "  .gotoPage(NavHomeBlock)",
      "  .method(AddItemBlock);",
      "export const g = map().gotoPage(NavLoginBlock).method(SubmitBlock).branch({",
      "  LoggedIn: (m) => m.gotoPage(NavCartBlock),",
      "  LoginPage: (m) => m,",
      "});",
      "res.end();",
      "timer.start();",
      "items.map((x) => x).join();",
      "",
    ].join("\n");
    assert.equal(convertChainEnds(before), after);
  });
});

describe("--codemod lands", () => {
  function project(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "wg-codemod-lands-"));
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    return dir;
  }

  it("turns a cast alias into the step option, imports what it needs, and removes a file of nothing but aliases", () => {
    const dir = project({
      "src/states.ts": 'export const Form = checkpoint("Form"); export type Form = typeof Form;\nexport const Detail = checkpoint("Detail"); export type Detail = typeof Detail;\n',
      "src/submit.block.ts": "export const SubmitBlock = defineMethodBlock({});\n",
      "src/submit-for-flow.ts": [
        'import type { MethodBlock } from "waygraph";',
        'import type { Form, Detail } from "./states.js";',
        'import { SubmitBlock } from "./submit.block.js";',
        "export const SubmitSaved = SubmitBlock as MethodBlock<Form, Detail>;",
        "export const SubmitRefused = SubmitBlock as MethodBlock<Form, Form>;",
        "",
      ].join("\n"),
      "src/a.flow.ts": [
        'import { SubmitSaved, SubmitRefused } from "./submit-for-flow.js";',
        "export const f = map().method(SubmitRefused).method(SubmitSaved, { pace: \"fast\" });",
        "",
      ].join("\n"),
    });
    try {
      const { changed, problems } = codemodLands(dir);
      assert.deepEqual(problems, []);
      assert.ok(changed.includes("src/submit-for-flow.ts (removed)"));
      assert.equal(existsSync(join(dir, "src/submit-for-flow.ts")), false);
      const flow = readFileSync(join(dir, "src/a.flow.ts"), "utf8");
      assert.match(flow, /\.method\(SubmitBlock, \{ lands: Form \}\)\.method\(SubmitBlock, \{ lands: Detail, pace: "fast" \}\)/);
      assert.match(flow, /import \{ SubmitBlock \} from "\.\/submit\.block\.js";/);
      assert.match(flow, /import \{ (Form, Detail|Detail, Form) \} from "\.\/states\.js";/);
      assert.doesNotMatch(flow, /submit-for-flow/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("an alias used outside a step is left, and said", () => {
    const dir = project({
      "src/states.ts": 'export const Detail = checkpoint("Detail");\n',
      "src/b.ts": 'import { Detail } from "./states.js";\nimport { SubmitBlock } from "./submit.js";\nexport const Saved = SubmitBlock as MethodBlock<Form, Detail>;\nconsole.log(Saved);\n',
      "src/submit.ts": "export const SubmitBlock = {};\n",
    });
    try {
      const { problems } = codemodLands(dir);
      assert.equal(problems.length, 1);
      assert.match(problems[0] ?? "", /Saved is used outside a step/);
      assert.match(readFileSync(join(dir, "src/b.ts"), "utf8"), /as MethodBlock/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
