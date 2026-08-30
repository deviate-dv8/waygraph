import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../src/index.js";
import { runGraph, withVerify, MemPage, checkpoint } from "../src/index.js";

const fakePage = { close: async () => {} } as unknown as import("@playwright/test").Page;
const fakeContext = { newPage: async () => fakePage } as any;

type Start = Checkpoint<"__start__">;
type Done = Checkpoint<"Done">;

test.describe("withVerify", () => {
  test("doesn't touch act/observe/resolve, only replaces verify", async () => {
    const original: Block<Start, Done> = {
      name: "original",
      instruction: {
        async act() {},
        resolve: () => checkpoint("Done"),
        verify: [{ name: "original-check", check: async () => true }],
      },
    };

    const decorated = withVerify(original, [{ name: "new-check", check: async () => true }]);

    expect(decorated.instruction.act).toBe(original.instruction.act);
    expect(decorated.instruction.resolve).toBe(original.instruction.resolve);
    expect(decorated.name).toBe(original.name);
    expect(decorated.instruction.verify).not.toBe(original.instruction.verify);
  });

  test("a stricter verify catches something the original block's own verify missed", async () => {
    const loose: Block<Start, Done> = {
      name: "loose",
      instruction: {
        async act() {},
        resolve: () => checkpoint("Done"),
        verify: [{ name: "loose-check", check: async () => true }],
      },
    };

    const strict = withVerify(loose, [{ name: "strict-check", check: async () => false }]);

    // Same Block, same action, only the confirmation differs by which flow uses it.
    await expect(
      runGraph<Done>(loose, undefined, fakeContext, new MemPage()),
    ).resolves.toEqual(checkpoint("Done"));

    await expect(
      runGraph<Done>(strict, undefined, fakeContext, new MemPage()),
    ).rejects.toThrow(/strict-check/);
  });

  test("withVerify(block, []) - the QA case: only care that resolve reached the Checkpoint, no DOM confirmation", async () => {
    const block: Block<Start, Done> = {
      name: "navigation-only",
      instruction: {
        async act() {},
        resolve: () => checkpoint("Done"),
        verify: [{ name: "would-have-failed", check: async () => false }],
      },
    };

    const navigationOnly = withVerify(block, []);

    const result = await runGraph<Done>(navigationOnly, undefined, fakeContext, new MemPage());
    expect(result).toEqual(checkpoint("Done"));
  });
});
