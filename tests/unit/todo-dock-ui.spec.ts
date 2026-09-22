import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveTodoDockUi } from "../../src/highlights.js";

describe("resolveTodoDockUi", () => {
  it("defaults to smart on", () => {
    const ui = resolveTodoDockUi(null, {});
    assert.deepEqual(ui, {
      compact: true,
      collision: true,
      behindRing: true,
      cap: 5,
      expandCap: 14,
    });
  });

  it("WAYGRAPH_TODO_UI=full opts everything off", () => {
    const ui = resolveTodoDockUi(null, { WAYGRAPH_TODO_UI: "full" });
    assert.equal(ui.compact, false);
    assert.equal(ui.collision, false);
    assert.equal(ui.behindRing, false);
  });

  it("author patch overrides env", () => {
    const ui = resolveTodoDockUi(
      { compact: false, cap: 8 },
      { WAYGRAPH_TODO_UI: "smart", WAYGRAPH_TODO_CAP: "5" },
    );
    assert.equal(ui.compact, false);
    assert.equal(ui.cap, 8);
    assert.equal(ui.collision, true);
  });

  it("per-knob env can disable collision only", () => {
    const ui = resolveTodoDockUi(null, { WAYGRAPH_TODO_COLLISION: "0" });
    assert.equal(ui.collision, false);
    assert.equal(ui.compact, true);
    assert.equal(ui.behindRing, true);
  });
});
