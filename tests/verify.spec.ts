import { test, expect } from "@playwright/test";
import type { Checkpoint, Block, Trait } from "../src/index.js";
import { connect, runGraph, MemPage, checkpoint } from "../src/index.js";

const fakePage = { close: async () => {} } as unknown as import("@playwright/test").Page;

type Start = Checkpoint<"__start__">;
type Done = Checkpoint<"Done">;

test.describe("verify", () => {
  test("a passing Trait lets the run proceed normally", async () => {
    const passing: Trait = { name: "always-true", check: async () => true };
    const entry: Block<Start, Done> = {
      name: "entry",
      instruction: {
        async act() {},
        resolve: () => checkpoint("Done"),
        verify: [passing],
      },
    };

    const mem = new MemPage();
    const fakeContext = { newPage: async () => fakePage } as any;
    const result = await runGraph<Done>(entry, undefined, fakeContext, mem);

    expect(result).toEqual(checkpoint("Done"));
  });

  test("a failing Trait throws an error naming the Trait and the Block", async () => {
    const failing: Trait = { name: "always-false", check: async () => false };
    const entry: Block<Start, Done> = {
      name: "entry-block",
      instruction: {
        async act() {},
        resolve: () => checkpoint("Done"),
        verify: [failing],
      },
    };

    const mem = new MemPage();
    const fakeContext = { newPage: async () => fakePage } as any;

    await expect(runGraph<Done>(entry, undefined, fakeContext, mem)).rejects.toThrow(
      /always-false.*entry-block/,
    );
  });

  test("verify cannot change which Checkpoint the run proceeds with", async () => {
    // The Trait itself has no way to return a different Checkpoint - its only
    // channel is boolean pass/fail, so resolve's output is what the run uses
    // regardless of what verify observes.
    const observant: Trait = { name: "just-watching", check: async () => true };
    const entry: Block<Start, Done> = {
      name: "entry",
      instruction: {
        async act() {},
        resolve: () => checkpoint("Done"),
        verify: [observant],
      },
    };

    const mem = new MemPage();
    const fakeContext = { newPage: async () => fakePage } as any;
    const result = await runGraph<Done>(entry, undefined, fakeContext, mem);

    expect(result).toEqual(checkpoint("Done"));
  });

  test("connect() runs an intermediate Block's verify before the next Block's act", async () => {
    const calls: string[] = [];
    const traceTrait: Trait = {
      name: "trace",
      check: async () => {
        calls.push("a.verify");
        return true;
      },
    };

    type Mid = Checkpoint<"Mid">;
    const a: Block<Start, Mid> = {
      name: "a",
      instruction: {
        async act() {
          calls.push("a.act");
        },
        resolve: () => checkpoint("Mid"),
        verify: [traceTrait],
      },
    };
    const b: Block<Mid, Done> = {
      name: "b",
      instruction: {
        async act() {
          calls.push("b.act");
        },
        resolve: () => checkpoint("Done"),
      },
    };

    const mem = new MemPage();
    const fakeContext = { newPage: async () => fakePage } as any;
    await runGraph<Done>(connect(a, b), undefined, fakeContext, mem);

    expect(calls).toEqual(["a.act", "a.verify", "b.act"]);
  });

  test("verify as a function picks different Traits depending on the resolved tag", async () => {
    type Succeeded = Checkpoint<"Succeeded">;
    type Failed = Checkpoint<"Failed">;
    let outcome: "succeeded" | "failed" = "succeeded";

    const entry: Block<Start, Succeeded | Failed> = {
      name: "branching-entry",
      instruction: {
        async act() {},
        resolve: () => checkpoint(outcome === "succeeded" ? "Succeeded" : "Failed"),
        verify: (out) =>
          out.__state === "Succeeded"
            ? [{ name: "succeeded-check", check: async () => true }]
            : [{ name: "failed-check", check: async () => false }],
      },
    };

    const mem = new MemPage();
    const fakeContext = { newPage: async () => fakePage } as any;

    outcome = "succeeded";
    await expect(
      runGraph<Succeeded | Failed>(entry, undefined, fakeContext, mem),
    ).resolves.toEqual(checkpoint("Succeeded"));

    outcome = "failed";
    await expect(
      runGraph<Succeeded | Failed>(entry, undefined, fakeContext, mem),
    ).rejects.toThrow(/failed-check/);
  });
});
