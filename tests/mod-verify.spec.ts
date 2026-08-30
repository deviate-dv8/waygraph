import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../src/index.js";
import { runGraph, modVerify, modVerifyAll, MemPage, checkpoint } from "../src/index.js";

const fakePage = { close: async () => {} } as unknown as import("@playwright/test").Page;
const fakeContext = { newPage: async () => fakePage } as any;

type Start = Checkpoint<"__start__">;
type Done = Checkpoint<"Done">;

function block(): Block<Start, Done> {
  return {
    name: "login",
    instruction: {
      async act() {},
      resolve: () => checkpoint("Done"),
      verify: [
        { name: "reached-inventory", check: async () => true },
        { name: "cart-badge", check: async () => true },
      ],
    },
  };
}

test.describe("modVerify", () => {
  test("the v1/v2 case: replaces only the named check, every other check untouched", async () => {
    const original = block();
    const v2 = modVerify(original, "reached-inventory", async () => false);

    // Untouched check still passes, so v1 still runs clean.
    await expect(
      runGraph<Done>(original, undefined, fakeContext, new MemPage()),
    ).resolves.toEqual(checkpoint("Done"));

    // Only "reached-inventory" changed for v2 - it now fails, naming itself,
    // while "cart-badge" (untouched) never even gets blamed.
    await expect(
      runGraph<Done>(v2, undefined, fakeContext, new MemPage()),
    ).rejects.toThrow(/reached-inventory/);

    // The untouched check is still literally the same array entry.
    const v2Verify = v2.instruction.verify as { name: string }[];
    expect(v2Verify[1]!.name).toBe("cart-badge");
  });

  test("inserting/reordering other checks can't retarget a name-addressed modVerify", () => {
    const original = block();
    const reordered: Block<Start, Done> = {
      ...original,
      instruction: {
        ...original.instruction,
        verify: [...(original.instruction.verify as { name: string }[])].reverse() as any,
      },
    };

    // Same name, now at index 0 instead of 1 - modVerify still finds the right one.
    const patched = modVerify(reordered, "cart-badge", async () => false);
    const patchedVerify = patched.instruction.verify as { name: string; check: unknown }[];
    const cartBadgeEntry = patchedVerify.find((t) => t.name === "cart-badge")!;
    const reachedInventoryEntry = patchedVerify.find((t) => t.name === "reached-inventory")!;

    expect(cartBadgeEntry.check).not.toBe(
      (reordered.instruction.verify as { name: string; check: unknown }[]).find(
        (t) => t.name === "cart-badge",
      )!.check,
    );
    expect(reachedInventoryEntry.check).toBe(
      (reordered.instruction.verify as { name: string; check: unknown }[]).find(
        (t) => t.name === "reached-inventory",
      )!.check,
    );
  });

  test("throws loud on a typo'd or unknown trait name, instead of silently doing nothing", () => {
    expect(() => modVerify(block(), "reached-invntory", async () => true)).toThrow(
      /no verify trait named "reached-invntory".*reached-inventory.*cart-badge/,
    );
  });

  test("also addressable by numeric index, not just name", async () => {
    const original = block();
    const byIndex = modVerify(original, 1, async () => false); // index 1 = "cart-badge"

    await expect(
      runGraph<Done>(byIndex, undefined, fakeContext, new MemPage()),
    ).rejects.toThrow(/cart-badge/); // keeps the existing name when addressed by index

    const byIndexVerify = byIndex.instruction.verify as { name: string }[];
    expect(byIndexVerify[0]!.name).toBe("reached-inventory"); // untouched
  });

  test("throws loud on an out-of-range index, same as an unknown name", () => {
    expect(() => modVerify(block(), 5, async () => true)).toThrow(/no verify trait at index 5/);
  });

  test("throws on a function-form verify - no fixed list to modify by name", () => {
    const branching: Block<Start, Done> = {
      name: "branching",
      instruction: {
        async act() {},
        resolve: () => checkpoint("Done"),
        verify: () => [{ name: "x", check: async () => true }],
      },
    };

    expect(() => modVerify(branching, "x", async () => false)).toThrow(/function-form verify/);
  });
});

test.describe("modVerifyAll", () => {
  test("the '100 traits' case: patches several named checks in one call, the other 97 untouched", () => {
    const hundredChecks: Block<Start, Done> = {
      name: "big-block",
      instruction: {
        async act() {},
        resolve: () => checkpoint("Done"),
        verify: Array.from({ length: 100 }, (_, i) => ({
          name: `check-${i}`,
          check: async () => true,
        })),
      },
    };

    const v2 = modVerifyAll(hundredChecks, {
      "check-0": async () => false,
      "check-50": async () => false,
      "check-99": async () => false,
    });

    const verify = v2.instruction.verify as { name: string; check: () => Promise<boolean> }[];
    expect(verify).toHaveLength(100);
    expect(verify[0]!.check()).resolves.toBe(false);
    expect(verify[50]!.check()).resolves.toBe(false);
    expect(verify[99]!.check()).resolves.toBe(false);
    // A spot-check of untouched entries - still the original passing check.
    expect(verify[1]!.check()).resolves.toBe(true);
    expect(verify[49]!.check()).resolves.toBe(true);
    expect(verify[98]!.check()).resolves.toBe(true);
  });

  test("still fails loud on a typo among the patches, naming that one specifically", () => {
    const block10: Block<Start, Done> = {
      name: "block-10",
      instruction: {
        async act() {},
        resolve: () => checkpoint("Done"),
        verify: Array.from({ length: 10 }, (_, i) => ({ name: `check-${i}`, check: async () => true })),
      },
    };

    expect(() =>
      modVerifyAll(block10, { "check-3": async () => false, "check-30": async () => false }),
    ).toThrow(/no verify trait named "check-30"/);
  });
});
