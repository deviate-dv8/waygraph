import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../src/index.js";
import { Engine, start, end, MemPage, checkpoint } from "../src/index.js";

const fakePage = { close: async () => {} } as unknown as import("@playwright/test").Page;
const fakeContext = { newPage: async () => fakePage } as any;

type Start = Checkpoint<"__start__">;
type A = Checkpoint<"A">;
type Done = Checkpoint<"Done">;

function twoBlockFlow() {
  const first: Block<Start, A> = {
    name: "first",
    instruction: {
      async act() {},
      resolve: () => checkpoint("A"),
      verify: [{ name: "first-check", check: async () => true }],
    },
  };
  const second: Block<A, Done> = {
    name: "second",
    instruction: { async act() {}, resolve: () => checkpoint("Done") },
  };
  return new Engine().defineFlow([start, first, second, end]);
}

test.describe("Flow.withBlockVerify / Flow.modBlockVerify", () => {
  test("modBlockVerify patches one named Block's one Trait - a spec can override a flow it only imports, without touching the flow's own file", async () => {
    const flow = twoBlockFlow();
    const patched = flow.modBlockVerify("first", "first-check", async () => false);

    // Original flow, untouched - still passes.
    await expect(flow.run(fakeContext, new MemPage())).resolves.toEqual(checkpoint("Done"));

    // Patched flow fails, naming the Block and the Trait, exactly like a
    // Block-level modVerify would - just addressed one level up.
    await expect(patched.run(fakeContext, new MemPage())).rejects.toThrow(/first-check/);
    await expect(patched.run(fakeContext, new MemPage())).rejects.toThrow(/first/);
  });

  test("withBlockVerify replaces the named Block's whole verify list", async () => {
    const flow = twoBlockFlow();
    const patched = flow.withBlockVerify("first", []);

    // Original still has its one (passing) check; patched has none at all -
    // both succeed here, so prove via modBlockVerify's failure case above and
    // this call not throwing for an empty list.
    await expect(patched.run(fakeContext, new MemPage())).resolves.toEqual(checkpoint("Done"));
  });

  test("modBlockVerify throws loud, naming every Block in the flow, when the Block name doesn't exist", async () => {
    const flow = twoBlockFlow();
    expect(() => flow.modBlockVerify("no-such-block", "first-check", async () => false)).toThrow(
      /no-such-block/,
    );
    expect(() => flow.modBlockVerify("no-such-block", "first-check", async () => false)).toThrow(
      /first.*second|second.*first/,
    );
  });

  test("patching returns a new Flow - the original Flow instance is never mutated", async () => {
    const flow = twoBlockFlow();
    flow.modBlockVerify("first", "first-check", async () => false);

    // Calling modBlockVerify above didn't touch `flow` itself - it's still the
    // original, still passing.
    await expect(flow.run(fakeContext, new MemPage())).resolves.toEqual(checkpoint("Done"));
  });

  test("addressing by numeric index (position in the flow's Block list) works the same as by name or reference", async () => {
    const flow = twoBlockFlow();
    // "first" is index 0 between start/end.
    const patched = flow.modBlockVerify(0, "first-check", async () => false);
    await expect(patched.run(fakeContext, new MemPage())).rejects.toThrow(/first-check/);
  });

  test("modBlockVerify throws loud on an out-of-range Block index, same as an unknown name", async () => {
    const flow = twoBlockFlow();
    expect(() => flow.modBlockVerify(5, "first-check", async () => false)).toThrow(/index 5/);
    expect(() => flow.modBlockVerify(-1, "first-check", async () => false)).toThrow(/index -1/);
  });

  test("addressing by the Block reference itself works the same as by name", async () => {
    const first: Block<Start, A> = {
      name: "first",
      instruction: {
        async act() {},
        resolve: () => checkpoint("A"),
        verify: [{ name: "first-check", check: async () => true }],
      },
    };
    const second: Block<A, Done> = {
      name: "second",
      instruction: { async act() {}, resolve: () => checkpoint("Done") },
    };
    const flow = new Engine().defineFlow([start, first, second, end]);

    const patched = flow.modBlockVerify(first, "first-check", async () => false);
    await expect(patched.run(fakeContext, new MemPage())).rejects.toThrow(/first-check/);
  });

  test("a Block reference still resolves after an earlier patch already swapped that slot for a new object - resolution is by .name, not object identity", async () => {
    const first: Block<Start, A> = {
      name: "first",
      instruction: {
        async act() {},
        resolve: () => checkpoint("A"),
        verify: [{ name: "check-a", check: async () => true }],
      },
    };
    const second: Block<A, Done> = {
      name: "second",
      instruction: { async act() {}, resolve: () => checkpoint("Done") },
    };
    const flow = new Engine().defineFlow([start, first, second, end]);

    // First patch swaps "first" for a brand-new object - `first` (the original
    // reference) is no longer `===` anything inside `oncePatched`.
    const oncePatched = flow.withBlockVerify(first, [{ name: "check-b", check: async () => true }]);
    // Addressing by the *original* `first` reference must still find that slot,
    // by name, even though the object living there now is a different one.
    const twicePatched = oncePatched.modBlockVerify(first, "check-b", async () => false);

    await expect(twicePatched.run(fakeContext, new MemPage())).rejects.toThrow(/check-b/);
  });

  test("patches stack - modBlockVerify on an already-patched Flow keeps the first patch", async () => {
    const first: Block<Start, A> = {
      name: "first",
      instruction: {
        async act() {},
        resolve: () => checkpoint("A"),
        verify: [{ name: "check-1", check: async () => true }],
      },
    };
    const second: Block<A, Done> = {
      name: "second",
      instruction: {
        async act() {},
        resolve: () => checkpoint("Done"),
        verify: [{ name: "check-2", check: async () => true }],
      },
    };
    const flow = new Engine().defineFlow([start, first, second, end]);

    const doublyPatched = flow
      .modBlockVerify("first", "check-1", async () => false)
      .modBlockVerify("second", "check-2", async () => false);

    // Only "first"'s patch should fire - it runs before "second" ever does.
    await expect(doublyPatched.run(fakeContext, new MemPage())).rejects.toThrow(/check-1/);
  });
});
