import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../../src/index.js";
import { Engine, start, end, MemPage, checkpoint, composeBlock, connect } from "../../src/index.js";

const fakePage = { close: async () => {} } as unknown as import("@playwright/test").Page;
const fakeContext = { newPage: async () => fakePage } as any;

type Start = Checkpoint<"__start__">;
type A = Checkpoint<"A">;
type B = Checkpoint<"B">;
type Done = Checkpoint<"Done">;

function threeSteps() {
  const step1: Block<Start, A> = {
    name: "step-1",
    instruction: {
      async act() {},
      resolve: () => checkpoint("A"),
      verify: [{ name: "step-1-check", check: async () => true }],
    },
  };
  const step2: Block<A, B> = {
    name: "step-2",
    instruction: {
      async act() {},
      resolve: () => checkpoint("B"),
      verify: [{ name: "step-2-check", check: async () => true }],
    },
  };
  const step3: Block<B, Done> = {
    name: "step-3",
    instruction: {
      async act() {},
      resolve: () => checkpoint("Done"),
      verify: [{ name: "step-3-check", check: async () => true }],
    },
  };
  return { step1, step2, step3 };
}

test.describe("composeBlock", () => {
  test("chains steps identically to hand-written connect() - same Out, same act order", async () => {
    const { step1, step2, step3 } = threeSteps();
    const composed = composeBlock("three-steps", [step1, step2, step3]);
    const handWritten = connect(connect(step1, step2), step3);

    const flowA = new Engine().defineFlow([start, composed, end]);
    const flowB = new Engine().defineFlow([start, handWritten as Block<Start, Done>, end]);
    const outA = await flowA.run(fakeContext, new MemPage());
    const outB = await flowB.run(fakeContext, new MemPage());
    expect(outA).toEqual(outB);
    expect(outA).toEqual(checkpoint("Done"));
  });

  test("composed Block's own name is the given name, not connect()'s auto-generated chain name", () => {
    const { step1, step2, step3 } = threeSteps();
    const composed = composeBlock("gov-form", [step1, step2, step3]);
    expect(composed.name).toBe("gov-form");
  });

  test("an intermediate step's own verify still runs at the right point - naming that step on failure", async () => {
    const { step1, step2, step3 } = threeSteps();
    const failingStep2: Block<A, B> = {
      ...step2,
      instruction: { ...step2.instruction, verify: [{ name: "step-2-check", check: async () => false }] },
    };
    const composed = composeBlock("three-steps", [step1, failingStep2, step3]);
    const flow = new Engine().defineFlow([start, composed, end]);
    await expect(flow.run(fakeContext, new MemPage())).rejects.toThrow(/step-2-check/);
    await expect(flow.run(fakeContext, new MemPage())).rejects.toThrow(/step-2/);
  });

  test("withStepVerify replaces one step's whole verify list, other steps untouched", async () => {
    const { step1, step2, step3 } = threeSteps();
    const composed = composeBlock("three-steps", [step1, step2, step3]);
    const patched = composed.withStepVerify("step-2", []);

    const flow = new Engine().defineFlow([start, patched, end]);
    await expect(flow.run(fakeContext, new MemPage())).resolves.toEqual(checkpoint("Done"));

    // Original composed Block untouched - still has step-2's original (passing) check.
    const original = new Engine().defineFlow([start, composed, end]);
    await expect(original.run(fakeContext, new MemPage())).resolves.toEqual(checkpoint("Done"));
  });

  test("modStepVerify replaces one Trait inside one step's verify list - fails loud, naming step and Trait", async () => {
    const { step1, step2, step3 } = threeSteps();
    const composed = composeBlock("three-steps", [step1, step2, step3]);
    const patched = composed.modStepVerify("step-2", "step-2-check", async () => false);

    const flow = new Engine().defineFlow([start, patched, end]);
    await expect(flow.run(fakeContext, new MemPage())).rejects.toThrow(/step-2-check/);

    // Original untouched.
    const original = new Engine().defineFlow([start, composed, end]);
    await expect(original.run(fakeContext, new MemPage())).resolves.toEqual(checkpoint("Done"));
  });

  test("a step reference still resolves after an earlier patch already swapped that slot - resolution by .name, not object identity", async () => {
    const { step1, step2, step3 } = threeSteps();
    const composed = composeBlock("three-steps", [step1, step2, step3]);

    const oncePatched = composed.withStepVerify(step2, [{ name: "step-2-check-v2", check: async () => true }]);
    const twicePatched = oncePatched.modStepVerify(step2, "step-2-check-v2", async () => false);

    const flow = new Engine().defineFlow([start, twicePatched, end]);
    await expect(flow.run(fakeContext, new MemPage())).rejects.toThrow(/step-2-check-v2/);
  });

  test("patches stack - modStepVerify on an already-patched composed Block keeps the first patch", async () => {
    const { step1, step2, step3 } = threeSteps();
    const composed = composeBlock("three-steps", [step1, step2, step3]);

    const doublyPatched = composed
      .modStepVerify("step-1", "step-1-check", async () => false)
      .modStepVerify("step-3", "step-3-check", async () => false);

    const flow = new Engine().defineFlow([start, doublyPatched, end]);
    // step-1 runs first - its patch should fire before step-3's ever gets a chance to.
    await expect(flow.run(fakeContext, new MemPage())).rejects.toThrow(/step-1-check/);
  });

  test("modStepVerify throws loud, naming every step, when the step name doesn't exist", () => {
    const { step1, step2, step3 } = threeSteps();
    const composed = composeBlock("three-steps", [step1, step2, step3]);
    expect(() => composed.modStepVerify("no-such-step", "step-1-check", async () => false)).toThrow(
      /no-such-step/,
    );
    expect(() => composed.modStepVerify("no-such-step", "step-1-check", async () => false)).toThrow(
      /step-1.*step-2.*step-3/,
    );
  });

  test("the composed Block is a plain Block - usable directly inside defineFlow like any other", async () => {
    const { step1, step2, step3 } = threeSteps();
    const composed = composeBlock("three-steps", [step1, step2, step3]);
    const flow = new Engine().defineFlow([start, composed, end]);
    await expect(flow.run(fakeContext, new MemPage())).resolves.toEqual(checkpoint("Done"));
  });
});
