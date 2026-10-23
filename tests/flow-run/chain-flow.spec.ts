import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../../src/index.js";
import { Engine, MemPage, checkpoint } from "../../src/index.js";
import { buildFlow, chainFlow, withSettings } from "../../src/engine/flow/flow.js";

type Start = Checkpoint<"__start__">;
type A = Checkpoint<"A">;

function makeFakePage(calls: string[]) {
  return {
    close: async () => {},
    evaluate: async () => {
      calls.push("session-reset");
    },
  } as unknown as import("@playwright/test").Page;
}

function makeFakeContext(page: import("@playwright/test").Page, calls: string[]) {
  return {
    newPage: async () => page,
    clearCookies: async () => {
      calls.push("clear-cookies");
    },
  } as any;
}

function makeBlock(name: string, calls: string[]): Block<Start, A> {
  return {
    name,
    instruction: {
      async act() {
        calls.push(name);
      },
      resolve: () => checkpoint("A"),
    },
  };
}

test.describe("chainFlow", () => {
  test("runs each sub-flow's blocks in order and returns the last flow's result", async () => {
    const calls: string[] = [];
    const engine = new Engine();
    const flowA = buildFlow([makeBlock("a", calls)], engine.config);
    const flowB = buildFlow([makeBlock("b", calls)], engine.config);

    const page = makeFakePage(calls);
    const context = makeFakeContext(page, calls);
    const combined = chainFlow(flowA, flowB);

    const result = await combined.run(context, new MemPage(), { page, closeOnFinish: false });

    expect(calls).toEqual(["a", "b"]);
    expect((result as { result: unknown }).result).toEqual(checkpoint("A"));
  });

  test("a withSessionReset sub-flow gets a session reset right before it runs - but never before the first flow", async () => {
    const calls: string[] = [];
    const engine = new Engine();
    const flowA = withSettings(buildFlow([makeBlock("a", calls)], engine.config), { sessionReset: true });
    const flowB = withSettings(buildFlow([makeBlock("b", calls)], engine.config), { sessionReset: true });

    const page = makeFakePage(calls);
    const context = makeFakeContext(page, calls);
    await chainFlow(flowA, flowB).run(context, new MemPage(), { page, closeOnFinish: false });

    // No reset before the very first flow (nothing to reset yet), one reset
    // right before the second flow's own Block runs.
    expect(calls).toEqual(["a", "clear-cookies", "session-reset", "b"]);
  });

  test("without withSessionReset, chaining two flows never resets session state", async () => {
    const calls: string[] = [];
    const engine = new Engine();
    const flowA = buildFlow([makeBlock("a", calls)], engine.config);
    const flowB = buildFlow([makeBlock("b", calls)], engine.config);

    const page = makeFakePage(calls);
    const context = makeFakeContext(page, calls);
    await chainFlow(flowA, flowB).run(context, new MemPage(), { page, closeOnFinish: false });

    expect(calls).toEqual(["a", "b"]);
  });

  test("flow settings are non-destructive and survive a withBlockVerify patch", async () => {
    const calls: string[] = [];
    const engine = new Engine();
    const plain = buildFlow([makeBlock("a", calls)], engine.config);
    const decorated = withSettings(plain, { sessionReset: true });

    expect(plain.resetSession).toBe(false);
    expect(decorated.resetSession).toBe(true);

    const patched = decorated.withBlockVerify("a", []);
    expect(patched.resetSession).toBe(true);
  });

  test("blocks() flattens every sub-flow in order and flags only the reset boundary", async () => {
    const calls: string[] = [];
    const engine = new Engine();
    const flowA = buildFlow([makeBlock("a", calls)], engine.config);
    const flowB = withSettings(buildFlow([makeBlock("b", calls)], engine.config), { sessionReset: true });
    const flowC = buildFlow([makeBlock("c", calls)], engine.config);

    const info = chainFlow(flowA, flowB, flowC).blocks();

    expect(info.map((bi) => bi.name)).toEqual(["a", "b", "c"]);
    expect(info[0]!.resetSessionBefore).toBeUndefined();
    expect(info[1]!.resetSessionBefore).toBe(true);
    expect(info[2]!.resetSessionBefore).toBeUndefined();
  });

  test("withBlockVerify on a chained result patches the right Block in the right sub-flow", async () => {
    const calls: string[] = [];
    const engine = new Engine();
    const flowA = buildFlow([makeBlock("a", calls)], engine.config);
    const flowB = buildFlow([makeBlock("b", calls)], engine.config);

    const patched = chainFlow(flowA, flowB).withBlockVerify("b", [
      { name: "always-fails", check: async () => false },
    ]);

    const page = makeFakePage(calls);
    const context = makeFakeContext(page, calls);
    await expect(
      patched.run(context, new MemPage(), { page, closeOnFinish: false }),
    ).rejects.toThrow(/always-fails/);
  });
});
