import { describe, it, expect } from "vitest";
import { resolveTodoDockUi } from "../../src/highlights.js";

describe("resolveTodoDockUi", () => {
  it("defaults to smart on", () => {
    const ui = resolveTodoDockUi(null, {});
    expect(ui).toEqual({
      compact: true,
      collision: true,
      behindRing: true,
      cap: 5,
      expandCap: 14,
    });
  });

  it("WAYGRAPH_TODO_UI=full opts everything off", () => {
    const ui = resolveTodoDockUi(null, { WAYGRAPH_TODO_UI: "full" });
    expect(ui.compact).toBe(false);
    expect(ui.collision).toBe(false);
    expect(ui.behindRing).toBe(false);
  });

  it("author patch overrides env", () => {
    const ui = resolveTodoDockUi(
      { compact: false, cap: 8 },
      { WAYGRAPH_TODO_UI: "smart", WAYGRAPH_TODO_CAP: "5" },
    );
    expect(ui.compact).toBe(false);
    expect(ui.cap).toBe(8);
    expect(ui.collision).toBe(true);
  });

  it("per-knob env can disable collision only", () => {
    const ui = resolveTodoDockUi(null, { WAYGRAPH_TODO_COLLISION: "0" });
    expect(ui.collision).toBe(false);
    expect(ui.compact).toBe(true);
    expect(ui.behindRing).toBe(true);
  });
});
