import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../src/types.js";
import { checkpoint } from "../src/types.js";
import { Engine, start, end } from "../src/engine.js";
import { MemPage } from "../src/mem-page.js";

// Real gap this proves fixed: before `Flow.run`'s `page`/`closeOnFinish`
// options existed, a run always opened its own fresh tab via
// `context.newPage()` and always closed it in `finally` - a flow could never
// drive an already-open page, and a caller could never get a page handle
// back to keep using after the run. See RELAY-TO-SLOT-6.md / the "action
// block" resolution for the same fix-in-userland-first principle this
// followed before landing here as an actual, additive engine option.

const URL_A = `data:text/html,${encodeURIComponent("<h1>A</h1>")}`;
const URL_B = `data:text/html,${encodeURIComponent("<h1>B</h1>")}`;

type Start = Checkpoint<"__start__">;
type Done = Checkpoint<"Done">;

const GotoA: Block<Start, Done> = {
  name: "goto-a",
  instruction: {
    async act(page) {
      await page.goto(URL_A);
    },
    resolve: () => checkpoint("Done"),
  },
};

const engine = new Engine();
const AFlow = engine.defineFlow([start, GotoA, end]);

test("Flow.run(context, mem, { page }) drives the given page instead of opening a new one", async ({ context, page }) => {
  await page.goto(URL_B);
  const before = context.pages().length;

  const result = await AFlow.run(context, new MemPage(), { page });

  expect(result).toEqual(checkpoint("Done"));
  // Same page object, navigated by the flow, no new tab opened for the run.
  expect(page.url()).toBe(URL_A);
  expect(context.pages().length).toBe(before);
});

test("Flow.run(context, mem, { closeOnFinish: false }) leaves the page open and hands it back", async ({ context }) => {
  const before = context.pages().length;

  const { result, page } = await AFlow.run(context, new MemPage(), { closeOnFinish: false });

  expect(result).toEqual(checkpoint("Done"));
  expect(page.url()).toBe(URL_A);
  expect(page.isClosed()).toBe(false);
  // A new page WAS opened for this run (default when no `page` is given) -
  // it's just not been closed, so the count goes up by one and stays there
  // until the caller (this test) closes it.
  expect(context.pages().length).toBe(before + 1);

  await page.close();
});

test("Flow.run(context, mem) with no options still closes its own page, unchanged", async ({ context }) => {
  const before = context.pages().length;

  const result = await AFlow.run(context, new MemPage());

  expect(result).toEqual(checkpoint("Done"));
  expect(context.pages().length).toBe(before);
});
