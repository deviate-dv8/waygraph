import { test, expect } from "@playwright/test";
import { openStage } from "../../src/demo/split/stage.js";

// The split view's stage shows each pane from its screencast, and what's done on the stage goes to the pane: a click
// on a button in a pane's picture clicks the button on the pane's real page; keys go to the pane last pointed at.
test("a click on the stage reaches the pane's page, at the same place; keys follow", async ({ browser }) => {
  const stageContext = await browser.newContext({ viewport: { width: 1200, height: 700 } });
  const stage = await stageContext.newPage();
  const shown = await openStage(stage, ["left", "right"], browser);
  const opened = await Promise.all(
    ["left", "right"].map(async (name) => {
      const context = await browser.newContext({ viewport: shown.host.viewport(name) });
      const page = await context.newPage();
      await page.setContent(`<button id="b" style="position:absolute;left:40%;top:40%;width:20%;height:20%">${name}</button>
<input id="i" style="position:absolute;left:0;top:0"><p id="clicked"></p>
<script>document.getElementById("b").onclick = () => (document.getElementById("clicked").textContent = "${name} clicked")</script>`);
      await shown.host.opened(name, page, `as ${name}`);
      return { name, page, context };
    }),
  );
  // Both pictures arrive, then a click in the middle of the right pane's picture.
  await expect(stage.locator('section[data-pane="right"] img')).toHaveJSProperty("complete", true);
  await expect.poll(() => stage.locator('section[data-pane="right"] img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const box = (await stage.locator('section[data-pane="right"] img').boundingBox())!;
  await stage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const right = opened.find((o) => o.name === "right")!.page;
  await expect(right.locator("#clicked")).toHaveText("right clicked");
  await expect(opened.find((o) => o.name === "left")!.page.locator("#clicked")).toHaveText("");
  // Keys go to the pane last pointed at.
  await right.locator("#i").focus();
  await stage.keyboard.type("ok");
  await expect(right.locator("#i")).toHaveValue("ok");
  await shown.close();
  for (const o of opened) await o.context.close();
  await stageContext.close();
});
