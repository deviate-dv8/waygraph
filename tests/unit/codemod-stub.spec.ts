import { test } from "node:test";
import assert from "node:assert/strict";
import { convertStub } from "../../src/cli/commands/codemod-stub.js";

test("a Block's stubAfter is stub; stubBefore and other calls stay", () => {
  const { text, changed } = convertStub(`A.stubBefore((c) => c).stubAfter((ctx) => { ctx.ui.caption("x"); }); obj.stubAfterX(1);`);
  assert.equal(changed, 1);
  assert.equal(text, `A.stubBefore((c) => c).stub((ctx) => { ctx.ui.caption("x"); }); obj.stubAfterX(1);`);
});
