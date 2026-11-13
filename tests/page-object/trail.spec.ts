import { test, expect } from "@playwright/test";
import { definePageBlock, Engine, MemPage } from "../../src/index.js";

// What step 1 showed is there for a check on a later step, on another page.
const Form = definePageBlock({
  name: "page-trail-form",
  checkpoint: "TrailForm",
  url: "data:text/html,<p id=created>Widget 42</p>",
  read: (ctx) => ({ created: ctx.page.text("#created") }),
  do: (self) => ({
    create: self.method({
      to: "TrailDone",
      async act(page) {
        await page.setContent(`<p id="done">All done</p>`);
      },
    }),
  }),
});
const Done = definePageBlock({
  name: "page-trail-done",
  checkpoint: "TrailDone",
  read: (ctx) => ({ banner: ctx.page.text("#done") }),
});

test("a check on a later page reads what an earlier page showed, typed by its key", async ({ page, context }) => {
  const mem = new MemPage();
  const flow = new Engine()
    .map()
    .gotoPage(Form)
    .method(Form.do.create, {
      expect: [Done.check("the banner is up and the created thing was named", ({ banner }, m) => banner === "All done" && m.trail.latest(Form.read.created) === "Widget 42")],
    });
  await flow.run(context, mem, { page });
  expect(mem.trail.latest(Form.read.created)).toBe("Widget 42");
  expect(mem.trail.all(Done.read.banner).map((s) => s.page)).toEqual(["TrailDone"]);
});
