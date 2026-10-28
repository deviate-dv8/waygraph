import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../../src/index.js";
import { Engine, checkpoint } from "../../src/index.js";
import { buildFlow, withSettings } from "../../src/engine/flow/flow.js";
import { startsFresh } from "../../src/runner/plan/plan.js";

// `waygraph run "a then b"`: which segment starts with a fresh session.

type Start = Checkpoint<"__start__">;
type A = Checkpoint<"A">;

function makeBlock(name: string): Block<Start, A> {
  return { name, instruction: { async act() {}, resolve: () => checkpoint("A") } };
}

const engine = new Engine();

test.describe("startsFresh", () => {
  test("a flow that wants a fresh session gets one when it follows another, never as the first", () => {
    const fresh = withSettings(buildFlow([makeBlock("b")], engine.config), { sessionReset: true });
    expect(startsFresh(fresh, 0)).toBe(false);
    expect(startsFresh(fresh, 1)).toBe(true);
  });

  test("without sessionReset, a following flow keeps the session", () => {
    const plain = buildFlow([makeBlock("b")], engine.config);
    expect(startsFresh(plain, 1)).toBe(false);
  });

  test("a flow whose first step resets starts fresh even when it runs first", () => {
    const inner = withSettings(buildFlow([makeBlock("a")], engine.config), { sessionReset: true });
    const outer = engine.map().flow(inner, { reset: true }).end();
    expect(startsFresh(outer, 0)).toBe(true);
  });
});
