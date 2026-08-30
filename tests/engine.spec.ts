import { test, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import type { Block, Checkpoint } from "../src/types.js";
import { runGraph } from "../src/engine.js";
import { checkpoint } from "../src/types.js";
import { MemPage } from "../src/mem-page.js";

type Start = Checkpoint<"__start__">;
type Done = Checkpoint<"Done">;
type Failed = Checkpoint<"Failed">;

/** A minimal fake BrowserContext/Page double - records lifecycle calls, no real browser. */
function fakeContext(): { context: BrowserContext; calls: string[] } {
  const calls: string[] = [];
  const page = {
    close: async () => {
      calls.push("page.close");
    },
  } as unknown as Page;
  const context = {
    newPage: async () => {
      calls.push("context.newPage");
      return page;
    },
  } as unknown as BrowserContext;
  return { context, calls };
}

test.describe("runGraph", () => {
  test("creates the page before act runs, and closes it exactly once", async () => {
    const { context, calls } = fakeContext();

    const entry: Block<Start, Done> = {
      name: "entry",
      instruction: {
        async act() {
          calls.push("entry.act");
        },
        resolve: () => {
          calls.push("entry.resolve");
          return checkpoint("Done");
        },
      },
    };

    const mem = new MemPage();
    await runGraph<Done>(entry, new Set(["Done"]), context, mem);

    expect(calls).toEqual(["context.newPage", "entry.act", "entry.resolve", "page.close"]);
    expect(calls.filter((c) => c === "page.close")).toHaveLength(1);
  });

  test("still closes the page exactly once when a step throws", async () => {
    const { context, calls } = fakeContext();

    const entry: Block<Start, Done> = {
      name: "entry",
      instruction: {
        async act() {
          throw new Error("boom");
        },
        resolve: () => checkpoint("Done"),
      },
    };

    const mem = new MemPage();
    await expect(runGraph<Done>(entry, new Set(["Done"]), context, mem)).rejects.toThrow("boom");

    expect(calls.filter((c) => c === "page.close")).toHaveLength(1);
  });

  test("returns the terminal Checkpoint value, not void or a fixed placeholder tag", async () => {
    const { context } = fakeContext();

    const entry: Block<Start, Done | Failed> = {
      name: "entry",
      instruction: {
        async act() {},
        resolve: () => checkpoint("Failed"),
      },
    };

    const mem = new MemPage();
    const result = await runGraph(entry, new Set(["Done", "Failed"]), context, mem);

    expect(result).toEqual(checkpoint("Failed"));
  });

  test("throws loud when the resolved Checkpoint is not a registered terminal", async () => {
    const { context } = fakeContext();

    const entry: Block<Start, Done> = {
      name: "entry",
      instruction: {
        async act() {},
        resolve: () => checkpoint("Done"),
      },
    };

    const mem = new MemPage();
    await expect(
      runGraph<Done>(entry, new Set(["SomethingElse"]), context, mem),
    ).rejects.toThrow(/not a registered terminal/);
  });
});
