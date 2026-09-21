import { test, expect } from "@playwright/test";
import { MemPage, checkpoint } from "waygraph";
import { routedDemoMapFlow } from "../src/flows/routed-demo-map.flow.js";

/**
 * Proof that `engine.map()` (the fluent, kind-checked flow builder) works
 * end to end against a real browser/DOM, not just the in-memory fakes
 * tests/nav/map-builder.spec.ts already covers in the main waygraph
 * package - same real fixture server and real Blocks routed-demo.spec.ts
 * already proves work via defineFlow/the CLI, this time built with
 * .start().gotoPage(...).method(...).gotoPage(...).end() instead.
 */
test("engine.map()-built flow runs for real: Dashboard -> click widget -> Docs", async ({ context }) => {
  const mem = new MemPage();
  const result = await routedDemoMapFlow.run(context, mem);
  expect(result).toEqual(checkpoint("Docs"));
});
