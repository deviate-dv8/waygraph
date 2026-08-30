import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../src/index.js";
import { runGraph, MemPage, checkpoint } from "../src/index.js";

// Two distinct real pages - proves this against actual navigation, not a mock.
const PAGE_A = `data:text/html,${encodeURIComponent("<h1>Page A</h1>")}`;
const PAGE_B = `data:text/html,${encodeURIComponent("<h1>Page B</h1>")}`;

type Start = Checkpoint<"__start__">;
type Done = Checkpoint<"Done">;

test("a Trait checking the URL catches a real, unintended redirect - the engine actually fails, not just reports success", async ({
  context,
}) => {
  const buggyRedirect: Block<Start, Done> = {
    name: "buggy-redirect",
    instruction: {
      async act(page) {
        await page.goto(PAGE_A);
        // Simulates a real bug: something (a stray click, a bad goto) sends the
        // page somewhere else before the Block is done.
        await page.goto(PAGE_B);
      },
      resolve: () => checkpoint("Done"),
      verify: [
        {
          name: "still-on-page-a",
          check: async (page) => page.url() === PAGE_A,
        },
      ],
    },
  };

  const mem = new MemPage();

  // The whole point: resolve() succeeded (it always returns "Done" unconditionally),
  // and yet the run must still fail, because verify caught what resolve couldn't see.
  await expect(runGraph<Done>(buggyRedirect, undefined, context, mem)).rejects.toThrow(
    /still-on-page-a.*buggy-redirect/,
  );
});

test("the same Trait passes when the page genuinely stays where expected", async ({ context }) => {
  const noRedirect: Block<Start, Done> = {
    name: "no-redirect",
    instruction: {
      async act(page) {
        await page.goto(PAGE_A);
      },
      resolve: () => checkpoint("Done"),
      verify: [
        {
          name: "still-on-page-a",
          check: async (page) => page.url() === PAGE_A,
        },
      ],
    },
  };

  const mem = new MemPage();
  const result = await runGraph<Done>(noRedirect, undefined, context, mem);

  expect(result).toEqual(checkpoint("Done"));
});
