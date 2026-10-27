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

test("the demo's typing is for the eye: every field ends with what a plain run's fill enters", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  // A date-time field (segments, not typed), a field that reads a typed "," as a decimal point (a number mask, like
  // Mantine's NumberInput), and a plain text field.
  await page.setContent(`
    <input id="when" type="datetime-local">
    <input id="qty" inputmode="decimal">
    <input id="name">
    <script>
      document.getElementById("qty").addEventListener("keydown", (e) => {
        if (e.key !== ",") return;
        e.preventDefault();
        const el = e.target;
        el.value += ".";
      });
    </script>`);
  const typed: string[] = [];
  page.on("console", () => {});
  await page.exposeFunction("noteKey", (k: string) => typed.push(k));
  await page.evaluate(() => document.getElementById("name")!.addEventListener("keydown", (e) => (window as unknown as { noteKey(k: string): void }).noteKey(e.key)));
  setLocatorTheater(page, {
    beforeFill: async () => {},
    typingDelay: () => 0,
    afterFill: async () => {},
    beforeClick: async () => "click",
    holdMs: () => 0,
    afterClick: async () => {},
  });
  await page.locator("#when").fill("2026-10-28T09:30");
  await page.locator("#qty").fill("1,200");
  await page.locator("#name").fill("Mixer");
  expect(await page.locator("#when").inputValue()).toBe("2026-10-28T09:30");
  expect(await page.locator("#qty").inputValue()).toBe("1,200");
  expect(await page.locator("#name").inputValue()).toBe("Mixer");
  // A plain text field is still typed key by key, for the demo.
  expect(typed.filter((k) => k.length === 1).join("")).toBe("Mixer");
  await context.close();
});
