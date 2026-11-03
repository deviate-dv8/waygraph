import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Project } from "ts-morph";
import { expectFindings } from "../../src/analysis/expect-check.js";

function kinds(source: string): string[] {
  const project = new Project({ useInMemoryFileSystem: true });
  return expectFindings(project.createSourceFile("/p/a.block.ts", source)).map((f) => f.kind);
}

describe("waygraph check: checks in the right home", () => {
  it("an Expect Block that acts on the page or sets mem", () => {
    const acts = "defineExpectBlock({ name: 'e', checkpoint: X, verify: [{ name: 'x', check: async (page) => { await page.reload(); return true; } }] });";
    assert.deepEqual(kinds(acts), ["mutating-expectation"]);
    const sets = "defineExpectBlock({ name: 'e', checkpoint: X, verify: [{ name: 'x', check: async (_p, mem) => { mem.set(K.ring, 'a'); return true; } }] });";
    assert.deepEqual(kinds(sets), ["mutating-expectation"]);
    assert.deepEqual(kinds("defineExpectBlock({ name: 'e', checkpoint: X, verify: [Trait.text(S.toast, 'Saved')] });"), []);
  });

  it("an Expect Block that only checks arrival", () => {
    assert.deepEqual(kinds("defineExpectBlock({ name: 'e', checkpoint: X, verify: [Trait.url({ pathname: '/x' }), Trait.visible(S.h1)] });"), ["arrival-in-expect"]);
  });

  it("a Method whose verify reads a message; not one that checks arrival, a field or a count (its contract)", () => {
    const outcome = "defineMethodBlock({ name: 'm', from: A, to: B, instruction: { async act() {}, verify: [Trait.url({ pathname: '/b' }), Trait.text(S.toast, 'Archived')] } });";
    assert.deepEqual(kinds(outcome), ["outcome-in-verify"]);
    const contract = "defineMethodBlock({ name: 'm', from: A, to: A, instruction: { async act() {}, verify: [Trait.value(S.name, 'x'), Trait.text(S.cartCount, '0')] } });";
    assert.deepEqual(kinds(contract), []);
  });

  it("an Expect Block that is one read check", () => {
    assert.deepEqual(kinds("defineExpectBlock({ name: 'e', checkpoint: X, verify: [Machine.status.is('Down')] });"), ["expect-one-read"]);
  });
});
