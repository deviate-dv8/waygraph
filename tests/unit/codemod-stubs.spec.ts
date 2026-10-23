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
    assert.match(text, /ctx\.todos\("cart", \[\{ id: "add", text: "Add an item" \}, "Check the cart"\], \{ title: "Cart", index: 1 \}\);/);
    assert.doesNotMatch(text, /todoId|todoTitle|todoIndex/);
    assert.match(text, /ctx\.ring\("cart"/);
  });

  it("gives a list with no id the default dock id", () => {
    const { text } = run(`B.stubAfter((ctx) => { ctx.todos(["A", "B"]); });`);
    assert.match(text, /ctx\.todos\("todos", \["A", "B"\]\);/);
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
    assert.match(text, /ctx\.title\("Hi"\);/);
    assert.match(text, /ctx\.orientation\("landscape"\);/);
    assert.match(text, /ctx\.orientation\("portrait"\);/);
    assert.match(text, /ctx\.hideDevice\(\);/);
    assert.match(text, /ctx\.hideTodos\(\);/);
    assert.match(text, /ctx\.todoDockUi\(\{ compact: false, collision: false, behindRing: false \}\);/);
  });

  it("leaves other objects' methods alone", () => {
    const { text } = run(`function f(page: { banner(): void }) { page.banner(); }`);
    assert.match(text, /page\.banner\(\)/);
  });

  it("reports a dock setter with no list beside it", () => {
    const { problems } = run(`B.stubAfter((ctx) => { ctx.todoTitle("Later"); });`);
    assert.equal(problems.length, 1);
  });
});
