import { checkpoint } from "../src/engine/checkpoint/checkpoint.js";
import { defineMethodBlock, defineAssertBlock } from "../src/engine/block/kinds/method.js";
import { defineNavBlock } from "../src/engine/block/kinds/nav.js";

const method = defineMethodBlock({
  name: "m",
  from: checkpoint("A"),
  to: checkpoint("B"),
  instruction: { async act() {}, resolve: () => checkpoint("B") },
});
const nav = defineNavBlock({ name: "n", checkpoint: checkpoint("B"), url: "/" });
const assert = defineAssertBlock({ name: "a", checkpoint: checkpoint("B"), verify: [] });

// A stub gets a real StubCtx, not implicit any: a typo'd ctx method is a compile error.
void method.stubAfter((ctx) => {
  ctx.ring("x", { selector: "h1", label: "x" });
  // @ts-expect-error - not a StubCtx method
  ctx.ringg("x", {});
});
void nav.stubBefore((ctx) => {
  ctx.caption("hi");
  // @ts-expect-error - not a StubCtx method
  ctx.captionn("hi");
});
void assert.stubOnError((ctx) => ctx.title("t")).stubAfter((ctx) => ctx.showNetworkTab());

// One form: a stub is a function chained where a flow uses the Block.
// @ts-expect-error - a slot map is not a stub
void nav.stubAfter({ title: { selector: "h1", label: "Title" } });
// @ts-expect-error - Blocks carry no narration: no stub in the options
defineNavBlock({ name: "s", checkpoint: checkpoint("B"), url: "/", stubAfter: () => {} });
defineMethodBlock({
  name: "i",
  to: checkpoint("B"),
  // @ts-expect-error - nor in the instruction
  instruction: { async act() {}, stubBefore: () => {} },
});
