import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../../src/index.js";
import {
  Engine,
  start,
  end,
  MemPage,
  checkpoint,
  composeBlock,
  fastForwardComposeBlock,
  isFastForwardBlock,
} from "../../src/index.js";

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

test.describe("fastForwardComposeBlock", () => {
  test("marks fastForward and still chains like composeBlock", async () => {
    const { step1, step2, step3 } = threeSteps();
    const ff = fastForwardComposeBlock("ff-three", [step1, step2, step3]);
    const plain = composeBlock("three-steps", [step1, step2, step3]);

    expect(ff.fastForward).toBe(true);
    expect(isFastForwardBlock(ff)).toBe(true);
    expect(isFastForwardBlock(plain)).toBe(false);
    expect(ff.name).toBe("ff-three");
    expect(ff.steps().map((s) => s.name)).toEqual(["step-1", "step-2", "step-3"]);

    const outFf = await new Engine().defineFlow([start, ff, end]).run(fakeContext, new MemPage());
    const outPlain = await new Engine()
      .defineFlow([start, plain, end])
      .run(fakeContext, new MemPage());
    expect(outFf).toEqual(outPlain);
    expect(outFf).toEqual(checkpoint("Done"));
  });

  test("Flow.blocks lists FF as one opaque entry", () => {
    const { step1, step2, step3 } = threeSteps();
    const ff = fastForwardComposeBlock("ff-three", [step1, step2, step3]);
    const flow = new Engine().defineFlow([start, ff, end]);
    expect(flow.blocks().map((b) => b.name)).toEqual(["ff-three"]);
  });

  test("inner verify failure is prefixed with FF name", async () => {
    const { step1, step2, step3 } = threeSteps();
    const failingStep2: Block<A, B> = {
      ...step2,
      instruction: {
        ...step2.instruction,
        verify: [{ name: "step-2-check", check: async () => false }],
      },
    };
    const ff = fastForwardComposeBlock("ff-owner-auth", [step1, failingStep2, step3]);
    const flow = new Engine().defineFlow([start, ff, end]);
    await expect(flow.run(fakeContext, new MemPage())).rejects.toThrow(
      /ff-owner-auth > .*step-2/,
    );
  });
});
