import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chainSegments, parseChainSpec } from "../../src/runner/plan/spec.js";

describe("chain spec", () => {
  it("splits at each `then` between segments, not inside a payload or a name", () => {
    assert.deepEqual(chainSegments('loginFlow then addToCart({"note":"and then (x"}) then src/flows/shop.flow.ts'), [
      { ref: "loginFlow" },
      { ref: "addToCart", payload: '{"note":"and then (x"}' },
      { ref: "src/flows/shop.flow.ts" },
    ]);
    assert.deepEqual(chainSegments("authenticate then thenable"), [{ ref: "authenticate" }, { ref: "thenable" }]);
  });

  it("a segment's payload is its mem JSON; a name that isn't one is refused", () => {
    assert.deepEqual(parseChainSpec('a then b({"k":1})'), [{ ref: "a" }, { ref: "b", json: '{"k":1}' }]);
    assert.throws(() => parseChainSpec("src/flows/x.flow.ts"), /could not parse segment/);
  });
});
