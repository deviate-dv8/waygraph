import type { Checkpoint } from "../src/core/types.js";
import { checkpoint } from "../src/core/types.js";
import { defineMethodBlock, defineNavBlock, defineAssertBlock } from "../src/core.js";

type A = Checkpoint<"A">;
type B = Checkpoint<"B">;

// Inline stub functions must get a real StubCtx, not implicit any (noImplicitAny would fail).
// A typo'd ctx method must be a compile error, proving ctx isn't `any`.
const _method = defineMethodBlock<A, B>({
  name: "m",
  instruction: {
    async act() {},
    resolve: () => checkpoint("B"),
    stubAfter(ctx) {
      ctx.ring("x", { selector: "h1", label: "x" });
      // @ts-expect-error - not a StubCtx method
      ctx.ringg("x", {});
    },
  },
});
void _method;

const _nav = defineNavBlock<B>({
  name: "n",
  checkpoint: "B",
  url: "/",
  stubBefore(ctx) {
    ctx.caption("hi");
    // @ts-expect-error - not a StubCtx method
    ctx.captionn("hi");
  },
});
void _nav;

const _assert = defineAssertBlock<B>({
  name: "a",
  checkpoint: "B",
  verify: [],
  stubOnError(ctx) {
    ctx.title("t");
  },
}).stubAfter((ctx) => {
  ctx.showNetworkTab();
});
void _assert;

// The static slot-map shorthand still works.
const _slots = defineNavBlock<B>({
  name: "s",
  checkpoint: "B",
  url: "/",
  stubAfter: { title: { selector: "h1", label: "Title" } },
});
void _slots;
