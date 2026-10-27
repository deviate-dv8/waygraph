import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Project } from "ts-morph";
import { convertStubs } from "../../src/cli/commands/codemod-stubs.js";

function run(source: string): { text: string; problems: string[] } {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile("/p/src/flows/cart.flow.ts", source);
  const { problems } = convertStubs(project);
  return { text: sf.getFullText(), problems: problems.map((p) => p.reason) };
}

describe("codemod flows: ctx stubs", () => {
  it("folds the list-only todos and its setters into todos(id, items, opts)", () => {
    const { text, problems } = run(`AddItemBlock.stubBefore((ctx) => {
  ctx.todoId("cart");
  ctx.todoTitle("Cart");
  ctx.todos([{ name: "add", text: "Add an item" }, "Check the cart"]);
  ctx.todoIndex(1);
  ctx.ring("cart", { selector: "#cart" });
});`);
    assert.deepEqual(problems, []);
    assert.match(text, /ctx\.ui\.todos\("cart", \[\{ id: "add", text: "Add an item" \}, "Check the cart"\], \{ title: "Cart", index: 1 \}\);/);
    assert.doesNotMatch(text, /todoId|todoTitle|todoIndex/);
    assert.match(text, /ctx\.ui\.ring\("cart"/);
  });

  it("gives a list with no id the default dock id", () => {
    const { text } = run(`B.stubAfter((ctx) => { ctx.todos(["A", "B"]); });`);
    assert.match(text, /ctx\.ui\.todos\("todos", \["A", "B"\]\);/);
  });

  it("renames the method aliases", () => {
    const { text } = run(`B.stubAfter((ctx) => {
  ctx.banner("Hi");
  ctx.landscape();
  ctx.portrait();
  ctx.clearDevice();
  ctx.clearTodos();
  ctx.todoDockFull();
});`);
    assert.match(text, /ctx\.ui\.title\("Hi"\);/);
    assert.match(text, /ctx\.ui\.orientation\("landscape"\);/);
    assert.match(text, /ctx\.ui\.orientation\("portrait"\);/);
    assert.match(text, /ctx\.ui\.hideDevice\(\);/);
    assert.match(text, /ctx\.ui\.hideTodos\(\);/);
    assert.match(text, /ctx\.ui\.todoDockUi\(\{ compact: false, collision: false, behindRing: false \}\);/);
  });

  it("leaves other objects' methods alone", () => {
    const { text } = run(`function f(page: { banner(): void }) { page.banner(); }`);
    assert.match(text, /page\.banner\(\)/);
  });

  it("reports a dock setter with no list beside it", () => {
    const { problems } = run(`B.stubAfter((ctx) => { ctx.todoTitle("Later"); });`);
    assert.equal(problems.length, 1);
  });

  it("turns a slot map into ctx.ring calls", () => {
    const { text } = run(`B.stubAfter({ title: { selector: "h1", label: "Title" } });`);
    assert.match(text, /B\.stubAfter\(\(ctx\) => \{\s*ctx\.ui\.ring\("title", \{ selector: "h1", label: "Title" \}\);\s*\}\)/);
  });

  it("moves a stub out of a Block definition onto a chained call", () => {
    const { text } = run(`export const A = defineApiBlock({
  name: "a",
  stubBefore: (ctx) => {
    ctx.title("Checking");
  },
});
export const M = defineMethodBlock({
  name: "m",
  instruction: {
    async act() {},
    stubAfter(ctx) {
      ctx.ring("x", { selector: "#x" });
    },
  },
});`);
    assert.doesNotMatch(text, /stubBefore:|stubAfter\(ctx\) \{/);
    assert.match(text, /\}\)\.stubBefore\(\(ctx\) => \{\s*ctx\.ui\.title\("Checking"\);\s*\}\);/);
    assert.match(text, /\}\)\.stubAfter\(\(ctx\) => \{\s*ctx\.ui\.ring\("x", \{ selector: "#x" \}\);\s*\}\);/);
  });

  it("moves a Block's slides into ctx.slides in its stubAfter", () => {
    const { text } = run(`export const F = defineMethodBlock({
  name: "f",
  instruction: {
    async act() {},
    slides: [{ caption: "One", tag: "YAP" }],
  },
});
export const H = defineAssertBlock({
  name: "h",
  checkpoint: Home,
  slides: (out) => [{ caption: out.__state }],
});
export const R = defineMethodBlock({
  name: "r",
  instruction: {
    async act() {},
    stubAfter: (ctx) => ctx.ring("x", { selector: "#x" }),
    slides: [{ caption: "Two" }],
  },
});`);
    assert.doesNotMatch(text, /slides:/);
    assert.match(text, /\}\)\.stubAfter\(\(ctx\) => ctx\.ui\.slides\(\[\{ caption: "One", tag: "YAP" \}\]\)\);/);
    assert.match(text, /\.stubAfter\(\(ctx\) => ctx\.ui\.slides\(\(\(out\) => \[\{ caption: out\.__state \}\]\)\(ctx\.out!\)\)\);/);
    assert.match(text, /\.stubAfter\(async \(ctx\) => \{\s*await \(\(ctx\) => ctx\.ui\.ring\("x", \{ selector: "#x" \}\)\)\(ctx\);\s*ctx\.ui\.slides\(\[\{ caption: "Two" \}\]\);\s*\}\);/);
  });

  it("turns ctx.highlights({...}) into one ctx.ring per ring", () => {
    const { text, problems } = run(`B.stubBefore((ctx) => {
  ctx.title("Hi");
  ctx.highlights({ email: { selector: "#e", label: "Email" }, "sign-in": { selector: "#s", label: "Sign in" } });
  ctx.todos(["A", "B"]);
});`);
    assert.deepEqual(problems, []);
    assert.doesNotMatch(text, /highlights\(/);
    assert.match(text, /ctx\.ui\.todos\("todos", \["A", "B"\]\);/);
    assert.match(text, /ctx\.ui\.title\("Hi"\);\s*ctx\.ui\.ring\("email", \{ selector: "#e", label: "Email" \}\);\s*ctx\.ui\.ring\("sign-in", \{ selector: "#s", label: "Sign in" \}\);/);
  });

  it("unwraps narrate() to its action, reports the caption and drops the import", () => {
    const { text, problems } = run(`import { defineMethodBlock, narrate } from "waygraph";
export const F = defineMethodBlock({
  name: "f",
  instruction: {
    async act(page) {
      const b = page.locator("#finish");
      await narrate(b, "Placing the order", () => b.click());
    },
  },
});`);
    assert.match(text, /import \{ defineMethodBlock \} from "waygraph";/);
    assert.match(text, /await b\.click\(\);/);
    assert.doesNotMatch(text, /narrate/);
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /"Placing the order"/);
  });

  it("moves everything a stub paints under ctx.ui, once, leaving ctx.mem / out / error alone", () => {
    const source = `import type { StubCtx } from "waygraph";
export function shared(ctx: StubCtx): void {
  ctx.title(String(ctx.mem?.get(K)));
  ["a", "b"].forEach((id) => ctx.ring(id, { selector: "#" + id }));
}
B.stubAfter((c) => c.caption(String(c.out?.__state)));
const notAStub = (ctx: { title(t: string): void }) => ctx.title("x");`;
    const once = run(source).text;
    assert.match(once, /ctx\.ui\.title\(String\(ctx\.mem\?\.get\(K\)\)\);/);
    assert.match(once, /forEach\(\(id\) => ctx\.ui\.ring\(id,/);
    assert.match(once, /c\.ui\.caption\(String\(c\.out\?\.__state\)\)/);
    assert.match(once, /notAStub = \(ctx: \{ title\(t: string\): void \}\) => ctx\.title\("x"\)/);
    assert.equal(run(once).text, once);
  });
});
