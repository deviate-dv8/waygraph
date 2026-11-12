import { test, expect } from "@playwright/test";
import { Engine, MemPage, Trait, definePageBlock } from "../../src/index.js";

test("a page in an iframe sees its selectors scoped to the frame: act, verify and read", async ({ context, page }) => {
  await page.setContent(`<h1 id="title">Partner</h1><iframe id="embed"></iframe>`);
  await page.evaluate(() => {
    (document.getElementById("embed") as HTMLIFrameElement).srcdoc = `<button id="go" onclick="r.textContent='done'">Go</button><p id="r">idle</p>`;
  });
  const Widget = definePageBlock({
    name: "page-po-widget",
    checkpoint: "PoWidget",
    frame: "#embed",
    verify: [Trait.visible("#go")],
    read: (ctx) => ({ result: ctx.page.text("#r") }),
    do: (p) => ({
      press: p.method({ async act(pg) { await pg.locator("#go").click(); }, verify: [Trait.text("#r", "done")] }),
    }),
  });
  // The same selector #title is the partner page's, outside the frame: the page's locators don't reach it.
  await new Engine().map().gotoPage(Widget).method(Widget.do.press).run(context, new MemPage(), { page });
  expect(await page.frameLocator("#embed").locator("#r").textContent()).toBe("done");
  await expect(page.locator("#title")).toHaveText("Partner");
});
