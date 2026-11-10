import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chainSegments, parseChainSpec } from "../../src/runner/plan/spec.js";

describe("chain spec", () => {
  it("splits at each `then` between segments, not inside a payload or a name", () => {
    assert.deepEqual(chainSegments('loginFlow then addToCart({"note":"and then (x"}) then src/flows/cart/shop.flow.ts'), [
      { ref: "loginFlow" },
      { ref: "addToCart", payload: '{"note":"and then (x"}' },
      { ref: "src/flows/cart/shop.flow.ts" },
    ]);
    assert.deepEqual(chainSegments("authenticate then thenable"), [{ ref: "authenticate" }, { ref: "thenable" }]);
  });

  it("a path's own (group) folder is part of the name; only a ( … ) ending the segment is its payload", () => {
    assert.deepEqual(chainSegments("src/flows/(user-stories)/signup.flow.ts then loginFlow"), [
      { ref: "src/flows/(user-stories)/signup.flow.ts" },
      { ref: "loginFlow" },
    ]);
    assert.deepEqual(chainSegments('src/flows/(showcase)/demo.flow.ts({"k":"(x"})'), [
      { ref: "src/flows/(showcase)/demo.flow.ts", payload: '{"k":"(x"}' },
    ]);
  });

  it("a segment's payload is its mem JSON; a name that isn't one is refused", () => {
    assert.deepEqual(parseChainSpec('a then b({"k":1})'), [{ ref: "a" }, { ref: "b", json: '{"k":1}' }]);
    assert.throws(() => parseChainSpec("src/flows/x.flow.ts"), /could not parse segment/);
  });
});
