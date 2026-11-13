import { test, expect } from "@playwright/test";
import { definePageBlock, Engine, MemPage, onRunEvent } from "../../src/index.js";
import type { RunEvent } from "../../src/index.js";

// `.on(Page, p => ...)`: several Methods of one page as one call; each is still its own step.
const Lines = definePageBlock({
  name: "page-on-lines",
  checkpoint: "OnLines",
  url: "data:text/html,<input id=q><ul id=rows></ul>",
  read: (ctx) => ({ rows: ctx.page.texts("#rows li") }),
  do: (self) => ({
    type: self.method((text: string) => ({
      async act(page) {
        await page.locator("#q").fill(text);
      },
    })),
    submit: self.method({
      async act(page) {
        await page.evaluate(() => {
          const q = (document.getElementById("q") as HTMLInputElement).value;
          document.getElementById("rows")!.innerHTML = `<li>${q.replace(/</g, "&lt;")}</li>`;
        });
      },
    }),
  }),
});

test("each call of the chain is a step with its own name and expect", async ({ page, context }) => {
  const events: RunEvent[] = [];
  const off = onRunEvent((e) => events.push(e));
  try {
    await new Engine()
      .map()
      .gotoPage(Lines)
      .on(Lines, (p) => p.type("<b>x</b>").submit().with({ expect: [Lines.check("one marked row", ({ rows }) => rows.length === 1 && rows[0] === "<b>x</b>")] }))
      .run(context, new MemPage(), { page });
  } finally {
    off();
  }
  expect(events.filter((e) => e.type === "step:start").map((e) => (e as { block: string }).block)).toEqual(["page-on-lines", "on-lines-type(\"<b>x</b>\")", "on-lines-submit"]);
  // The chain offers the page's Methods only: a name it doesn't have is a compile error.
  // @ts-expect-error nope is not a Method of this page
  expect(() => new Engine().map().gotoPage(Lines).on(Lines, (p) => p.nope())).toThrow(/no Method "nope"/);
});
