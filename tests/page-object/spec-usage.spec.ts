import { test, expect } from "@playwright/test";
import { definePageBlock, Engine, MemPage } from "../../src/index.js";

// A spec of your own in Playwright Test: the test's `page` and `context` are the flow's, a Method takes its value as a
// param written on the step, a check is `Page.check`, and Playwright's own `expect` still judges after it.
const Search = definePageBlock({
  name: "page-spec-search",
  checkpoint: "SpecSearch",
  url: "about:blank",
  read: (ctx) => ({ rows: ctx.page.list(".row", (row) => ({ name: row.text(".name") })) }),
  do: (self) => ({
    type: self.method((text: string) => ({
      async act(page) {
        await page.evaluate((t) => {
          document.body.innerHTML = `<div class="row"><span class="name">${t.replace(/</g, "&lt;")}</span></div>`;
        }, text);
      },
    })),
  }),
});

test("a flow runs on the test's page; the Method's value is written on the step; the check reads the page", async ({ page, context }) => {
  const flow = new Engine()
    .map()
    .gotoPage(Search)
    .method(Search.do.type("<b>x</b>"), {
      expect: [Search.check("only lines named with the markup", ({ rows }) => rows.every((r) => r.name.includes("<b>x</b>")))],
    });
  await flow.run(context, new MemPage(), { page });
  // Playwright's own expect, on the same page the flow drove.
  await expect(page.locator(".name")).toHaveText("<b>x</b>");
});

test("a failing check fails the test with the step and what the page showed", async ({ page, context }) => {
  const flow = new Engine().map().gotoPage(Search).method(Search.do.type("plain"), { expect: [Search.check("every row has the markup", ({ rows }) => rows.every((r) => r.name.includes("<b>")))] });
  await expect(flow.run(context, new MemPage(), { page })).rejects.toThrow(/every row has the markup/);
});
