import { test, expect } from "@playwright/test";
import { checkpoint, defineReadBlock, MemPage, reads, Trait } from "../../src/index.js";
import { runVerify } from "../../src/engine/trait/verify.js";

const Shop = reads("traitReadShop")<{ items: string[]; total: number }>();
defineReadBlock({
  name: "read-trait-read-shop",
  instruction: { read: (ctx) => Shop({ items: ctx.page.texts("li"), total: ctx.page.number("#total") }) },
});
const Done = checkpoint("Done");

test("Trait.read checks what the page shows through its Read Block, retried until it settles", async ({ page }) => {
  await page.setContent(`<ul></ul><p id="total">$0</p><script>
    setTimeout(() => { document.querySelector("ul").innerHTML = "<li>a</li><li>b</li><li>c</li>"; document.getElementById("total").textContent = "$12.50"; }, 400);
  </script>`);
  await runVerify([Trait.read(Shop.items, (items) => items.length === 3, "3 items"), Trait.read(Shop.total, (t) => t === 12.5)], Done, page, new MemPage(), "list");
});

test("a failed Trait.read says what the page showed", async ({ page }) => {
  await page.setContent(`<ul><li>a</li></ul><p id="total">$3</p>`);
  await expect(
    runVerify([{ ...Trait.read(Shop.items, (items) => items.length === 3, "3 items"), timeoutMs: 200 }], Done, page, new MemPage(), "list"),
  ).rejects.toThrow('trait "read(traitReadShop.items)" failed after "list": wanted 3 items; saw ["a"]');
});

test("a key no Read Block reads fails, saying so", async ({ page }) => {
  const Nothing = reads("traitReadNothing")<{ x: string }>();
  await page.setContent(`<p>x</p>`);
  await expect(runVerify([{ ...Trait.read(Nothing.x, () => true), timeoutMs: 0 }], Done, page, new MemPage(), "x")).rejects.toThrow(/no value for traitReadNothing\.x/);
});
