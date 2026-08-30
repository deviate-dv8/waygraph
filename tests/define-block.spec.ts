import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../src/index.js";
import { defineBlock, branch, runGraph, MemPage, checkpoint } from "../src/index.js";

const fakePage = { close: async () => {} } as unknown as import("@playwright/test").Page;
const fakeContext = { newPage: async () => fakePage } as any;

type Start = Checkpoint<"__start__">;
type Done = Checkpoint<"Done">;
type A = Checkpoint<"A">;

test.describe("defineBlock", () => {
  test("attaches working withVerify/modVerify/modVerifyAll methods", async () => {
    const block = defineBlock<Start, Done>({
      name: "login",
      instruction: {
        async act() {},
        resolve: () => checkpoint("Done"),
        verify: [{ name: "check-a", check: async () => true }],
      },
    });

    expect(typeof block.withVerify).toBe("function");
    expect(typeof block.modVerify).toBe("function");
    expect(typeof block.modVerifyAll).toBe("function");

    const decorated = block.modVerify("check-a", async () => false);
    await expect(
      runGraph<Done>(decorated, undefined, fakeContext, new MemPage()),
    ).rejects.toThrow(/check-a/);
  });

  test("chains - .withVerify(...).modVerify(...) both apply, in order", async () => {
    const block = defineBlock<Start, Done>({
      name: "login",
      instruction: { async act() {}, resolve: () => checkpoint("Done") },
    });

    const chained = block
      .withVerify([{ name: "step-1", check: async () => true }])
      .modVerify("step-1", async () => false);

    await expect(
      runGraph<Done>(chained, undefined, fakeContext, new MemPage()),
    ).rejects.toThrow(/step-1/);
  });

  test("a raw object literal (no defineBlock) is still a perfectly valid Block", async () => {
    const raw: Block<Start, Done> = {
      name: "raw",
      instruction: { async act() {}, resolve: () => checkpoint("Done") },
    };

    expect(raw.withVerify).toBeUndefined();
    const result = await runGraph<Done>(raw, undefined, fakeContext, new MemPage());
    expect(result).toEqual(checkpoint("Done"));
  });

  test("CRITICAL: calling .withVerify() on a branch()'d block preserves its routing - does not silently drop next", async () => {
    const calls: string[] = [];

    const onA = defineBlock<A, Done>({
      name: "on-a",
      instruction: {
        async act() {
          calls.push("on-a.act");
        },
        resolve: () => checkpoint("Done"),
      },
    });

    const gate = defineBlock<Start, A>({
      name: "gate",
      instruction: {
        async act() {
          calls.push("gate.act");
        },
        resolve: () => checkpoint("A"),
      },
    });

    const routed = branch(gate, { A: onA });

    // If the routed Block's attached method used a stale closure (the shape
    // gate had *before* branch() added routing), this call would rebuild a
    // Block with no `next` at all, and the run would stop after "gate" -
    // "on-a.act" would never fire.
    const decorated = routed.withVerify([{ name: "harmless", check: async () => true }]);

    await runGraph<Done>(decorated, undefined, fakeContext, new MemPage());

    expect(calls).toEqual(["gate.act", "on-a.act"]);
  });
});
