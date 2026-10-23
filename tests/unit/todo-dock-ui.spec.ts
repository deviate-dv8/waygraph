import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveTodoDockUi } from "../../src/demo/narration/todo-dock.js";

/** Runs `fn` with these WAYGRAPH_TODO_* variables set, then puts the environment back. */
function withEnv<T>(vars: Record<string, string>, fn: () => T): T {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe("resolveTodoDockUi", () => {
  it("defaults to smart on", () => {
    const ui = withEnv({}, () => resolveTodoDockUi(null));
    assert.deepEqual(ui, {
      compact: true,
      collision: true,
      behindRing: true,
      cap: 5,
      expandCap: 14,
    });
  });

  it("WAYGRAPH_TODO_UI=full opts everything off", () => {
    const ui = withEnv({ WAYGRAPH_TODO_UI: "full" }, () => resolveTodoDockUi(null));
    assert.equal(ui.compact, false);
    assert.equal(ui.collision, false);
    assert.equal(ui.behindRing, false);
  });

  it("author patch overrides env", () => {
    const ui = withEnv({ WAYGRAPH_TODO_UI: "smart", WAYGRAPH_TODO_CAP: "5" }, () => resolveTodoDockUi({ compact: false, cap: 8 }));
    assert.equal(ui.compact, false);
    assert.equal(ui.cap, 8);
    assert.equal(ui.collision, true);
  });

  it("per-knob env can disable collision only", () => {
    const ui = withEnv({ WAYGRAPH_TODO_COLLISION: "0" }, () => resolveTodoDockUi(null));
    assert.equal(ui.collision, false);
    assert.equal(ui.compact, true);
    assert.equal(ui.behindRing, true);
  });
});
