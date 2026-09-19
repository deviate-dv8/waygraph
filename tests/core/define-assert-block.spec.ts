import { test, expect } from "@playwright/test";
import type { Checkpoint } from "../../src/index.js";
import { defineAssertBlock, checkpoint, MemPage } from "../../src/index.js";
import { runVerify } from "../../src/trait.js";

type Screen = Checkpoint<"Screen">;
type A = Checkpoint<"A">;
type B = Checkpoint<"B">;

function fakePage(waitForCalls: { name?: string }[]) {
  return {
    getByRole(_role: string, opts?: { name?: string }) {
      return {
        waitFor: async () => {
          waitForCalls.push(opts?.name !== undefined ? { name: opts.name } : {});
        },
      };
    },
  } as unknown as import("@playwright/test").Page;
}

test.describe("defineAssertBlock", () => {
  test("with no waitForHeading, act is a no-op and resolve returns the given checkpoint", async () => {
    const calls: { name?: string }[] = [];
    const block = defineAssertBlock<Screen>({ name: "assert-something", checkpoint: "Screen", verify: [] });
    const mem = new MemPage();
    await block.instruction.act(fakePage(calls), checkpoint("Screen"), mem);
    expect(calls).toEqual([]);
    expect(block.instruction.resolve(undefined as never)).toEqual(checkpoint("Screen"));
  });

  test("waitForHeading waits for that heading before verify runs", async () => {
    const calls: { name?: string }[] = [];
    const block = defineAssertBlock<Screen>({
      name: "assert-heading",
      checkpoint: "Screen",
      waitForHeading: "Some Heading",
      verify: [],
    });
    await block.instruction.act(fakePage(calls), checkpoint("Screen"), new MemPage());
    expect(calls).toEqual([{ name: "Some Heading" }]);
  });

  test("verify still runs and fails loud, naming itself - defineAssertBlock does not bypass verify", async () => {
    const block = defineAssertBlock<Screen>({
      name: "assert-fails",
      checkpoint: "Screen",
      verify: [{ name: "always-false", check: async () => false }],
    });
    const out = await block.instruction.resolve(undefined as never);
    await expect(
      runVerify(block.instruction.verify, out, fakePage([]), new MemPage(), block.name),
    ).rejects.toThrow(/always-false/);
  });

  test("the checkpoint tag is stated once - two Blocks self-loop to their own tag, not a shared default", () => {
    const a = defineAssertBlock<A>({ name: "assert-a", checkpoint: "A", verify: [] });
    const b = defineAssertBlock<B>({ name: "assert-b", checkpoint: "B", verify: [] });
    expect(a.instruction.resolve(undefined as never)).toEqual(checkpoint("A"));
    expect(b.instruction.resolve(undefined as never)).toEqual(checkpoint("B"));
  });
});
