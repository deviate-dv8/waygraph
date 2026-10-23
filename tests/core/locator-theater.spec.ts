import { test, expect } from "@playwright/test";
import { setLocatorTheater } from "../../src/demo/overlay/locator-theater.js";

test("a theater shows only its own page's fills and clicks; another page runs Playwright's own", async ({ browser }) => {
  const context = await browser.newContext();
  const shown = await context.newPage();
  const plain = await context.newPage();
  const html = `<input id="name"><button id="go" onclick="this.textContent='clicked'">go</button>`;
  await shown.setContent(html);
  await plain.setContent(html);
  const seen: string[] = [];
  setLocatorTheater(shown, {
    beforeFill: async () => void seen.push("fill"),
    typingDelay: () => 0,
    afterFill: async () => void seen.push("filled"),
    beforeClick: async () => {
      seen.push("click");
      return "click";
    },
    holdMs: () => 0,
    afterClick: async () => void seen.push("clicked"),
  });

  await plain.locator("#name").fill("plain");
  await plain.locator("#go").click();
  expect(seen).toEqual([]);

  await shown.locator("#name").fill("shown");
  await shown.locator("#go").click();
  expect(seen).toEqual(["fill", "filled", "click", "clicked"]);
  expect(await shown.locator("#name").inputValue()).toBe("shown");
  expect(await shown.locator("#go").textContent()).toBe("clicked");
  expect(await plain.locator("#name").inputValue()).toBe("plain");
  await context.close();
});
