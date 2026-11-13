import { checkpoint } from "../src/engine/checkpoint/checkpoint.js";
import { defineMethodBlock } from "../src/engine/block/kinds/method.js";
import { defineExpectBlock } from "../src/engine/block/kinds/expect.js";
import { defineNavBlock } from "../src/engine/block/kinds/nav.js";

const method = defineMethodBlock({
  name: "m",
  from: checkpoint("A"),
  to: checkpoint("B"),
  instruction: { async act() {}, resolve: () => checkpoint("B") },
});
const nav = defineNavBlock({ name: "n", checkpoint: checkpoint("B"), url: "/" });
const assert = defineExpectBlock({ name: "a", checkpoint: checkpoint("B"), verify: [] });

// A stub gets a real StubCtx, not implicit any: a typo'd ctx method is a compile error.
void method.stub((ctx) => {
  ctx.ui.ring("x", { selector: "h1", label: "x" });
  // @ts-expect-error - not a StubCtx method
  ctx.ui.ringg("x", {});
});
void nav.stubBefore((ctx) => {
  ctx.ui.caption("hi");
  // @ts-expect-error - not a StubCtx method
  ctx.ui.captionn("hi");
});
void assert.stubOnError((ctx) => ctx.ui.title("t")).stub((ctx) => ctx.ui.showNetworkTab());

// One form: a stub is a function chained where a flow uses the Block.
// @ts-expect-error - a slot map is not a stub
void nav.stub({ title: { selector: "h1", label: "Title" } });
// @ts-expect-error - Blocks carry no narration: no stub in the options
defineNavBlock({ name: "s", checkpoint: checkpoint("B"), url: "/", stubAfter: () => {} });
defineMethodBlock({
  name: "i",
  to: checkpoint("B"),
  // @ts-expect-error - nor in the instruction
  instruction: { async act() {}, stubBefore: () => {} },
});

// Painting lives under ctx.ui; ctx itself holds only the data a stub reads (mem, out, error).
void nav.stubBefore((ctx) => {
  // @ts-expect-error - ring is ctx.ui.ring
  ctx.ring("x", { selector: "h1", label: "x" });
});
