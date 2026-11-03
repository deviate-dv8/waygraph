import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Project } from "ts-morph";
import { builtInFindings } from "../../src/analysis/built-in-check.js";

function kinds(file: string, source: string): string[] {
  const project = new Project({ useInMemoryFileSystem: true });
  return builtInFindings(file, project.createSourceFile(file, source)).map((f) => f.kind);
}

describe("waygraph check: code for what waygraph already does", () => {
  it("a cast picking a Block's outcome", () => {
    assert.deepEqual(kinds("/p/a.ts", "export const Saved = SubmitBlock as MethodBlock<Form, Detail>;"), ["cast-to-outcome"]);
    assert.deepEqual(kinds("/p/a.ts", "export const x = y as Record<string, string>;"), []);
  });

  it("three or more chained steps with { ff: true }, not one or two", () => {
    const run = (n: number) => `m${".method(B, { ff: true })".repeat(n)}.method(C);`;
    assert.deepEqual(kinds("/p/a.flow.ts", run(3)), ["ff-run"]);
    assert.deepEqual(kinds("/p/a.flow.ts", run(2)), []);
  });

  it("a polling loop in a Trait file; not in a helper with no Trait", () => {
    const loop = "for (;;) { if (await check()) return true; if (Date.now() > until) return false; await new Promise((r) => setTimeout(r, 200)); }";
    assert.deepEqual(kinds("/p/t.ts", `import type { Trait } from "waygraph"; async function settles(check) { const until = Date.now() + 1; ${loop} }`), ["hand-rolled-retry"]);
    assert.deepEqual(kinds("/p/stack.ts", `async function waitUp(check) { const until = Date.now() + 1; ${loop} }`), []);
  });

  it("a spec seeding stubs by hand", () => {
    assert.deepEqual(kinds("/p/x.spec.ts", "seedMemStub(mem, flow); await flow.run(context, mem);"), ["seeded-spec"]);
  });

  it("a function over MapBuilder", () => {
    assert.deepEqual(kinds("/p/steps.ts", "type Start = MapBuilder<Checkpoint<'__start__'>>; export const signIn = (b: Start) => b.gotoPage(Nav);"), ["builder-helper", "start-tag"]);
  });

  it("overlay workarounds: a dispatched click, a native value setter", () => {
    assert.deepEqual(kinds("/p/c.ts", `try { await t.click(); } catch { await t.dispatchEvent("click"); }`), ["overlay-workaround"]);
    assert.deepEqual(kinds("/p/d.ts", `const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;`), ["overlay-workaround"]);
  });

  it("the start tag spelled by hand", () => {
    assert.deepEqual(kinds("/p/s.ts", 'const Start = checkpoint("__start__");'), ["start-tag"]);
    assert.deepEqual(kinds("/p/s.ts", 'type Start = Checkpoint<"__start__">;'), ["start-tag"]);
  });

});
