import { test } from "node:test";
import assert from "node:assert/strict";
import { convertChecks } from "../../src/cli/commands/codemod-checks.js";

test("a read key's passes becomes the page's check, the test destructuring the field", () => {
  const { text, changed } = convertChecks(`expect: [Inventory.read.items.passes((items, mem) => items.some((i) => i.name === mem.get(K).name), "the item in the cart")]`);
  assert.equal(changed, 1);
  assert.equal(text, `expect: [Inventory.check("the item in the cart", ({ items }, mem) => items.some((i) => i.name === mem.get(K).name))]`);
});

test("another parameter name is renamed in the pattern; no description gets the field's; a named test is called with the field", () => {
  assert.equal(convertChecks(`a.read.lines.passes((l) => l.length === 0)`).text, `a.check("lines passes", ({ lines: l }) => l.length === 0)`);
  assert.equal(convertChecks(`a.read.total.passes(isOk, "ok")`).text, `a.check("ok", (read, mem) => (isOk)(read.total, mem))`);
  assert.equal(convertChecks(`self.read.cart.count.passes((n) => n > 0, "some")`).text, `self.check("some", ({ cart: { count: n } }) => n > 0)`);
});
