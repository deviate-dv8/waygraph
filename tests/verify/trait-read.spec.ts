import { test, expect } from "@playwright/test";
import { checkpoint, defineReadBlock, keys, MemPage, reads } from "../../src/index.js";
import { runVerify, takeCheckedElements } from "../../src/engine/trait/verify.js";

const Shop = reads("traitReadShop")<{ items: string[]; total: number }>();
defineReadBlock({
  name: "read-trait-read-shop",
  instruction: { read: (ctx) => Shop({ items: ctx.page.texts("li"), total: ctx.page.number("#total") }) },
});
const Done = checkpoint("Done");

test("Key.passes checks what the page shows through its Read Block, retried until it settles", async ({ page }) => {
  await page.setContent(`<ul></ul><p id="total">$0</p><script>
    setTimeout(() => { document.querySelector("ul").innerHTML = "<li>a</li><li>b</li><li>c</li>"; document.getElementById("total").textContent = "$12.50"; }, 400);
  </script>`);
  await runVerify([Shop.items.passes((items) => items.length === 3, "3 items"), Shop.total.passes((t) => t === 12.5)], Done, page, new MemPage(), "list");
});

test("a failed read check says what the page showed", async ({ page }) => {
  await page.setContent(`<ul><li>a</li></ul><p id="total">$3</p>`);
  await expect(
    runVerify([{ ...Shop.items.passes((items) => items.length === 3, "3 items"), timeoutMs: 200 }], Done, page, new MemPage(), "list"),
  ).rejects.toThrow('list: check "read(traitReadShop.items)" didn\'t pass\n  wanted  3 items\n  saw     ["a"]');
});

test("a key no Read Block reads fails, saying so", async ({ page }) => {
  const Nothing = reads("traitReadNothing")<{ x: string }>();
  await page.setContent(`<p>x</p>`);
  await expect(runVerify([{ ...Nothing.x.passes(() => true), timeoutMs: 0 }], Done, page, new MemPage(), "x")).rejects.toThrow(/no value for traitReadNothing\.x/);
});

test("a key the page doesn't show fails with what the page shows instead", async ({ page }) => {
  const Form = reads("traitReadForm")<{ sent: string; error: string }>();
  defineReadBlock({
    name: "read-trait-read-form",
    instruction: { read: (ctx) => Form({ sent: ctx.page.text("#sent"), error: ctx.page.text("#error") }) },
  });
  await page.setContent(`<p id="error">Could not send the link</p>`);
  await expect(runVerify([{ ...Form.sent.passes(() => true), timeoutMs: 0 }], Done, page, new MemPage(), "submit")).rejects.toThrow(
    'no value for traitReadForm.sent; the page shows traitReadForm.error "Could not send the link"',
  );
});

test("Key.passes' test gets mem: what the page shows against what the flow did", async ({ page }) => {
  const Picked = keys("traitReadPicked")<{ item: string }>();
  const mem = new MemPage();
  mem.set(Picked.item, "b");
  await page.setContent(`<ul><li>a</li><li>b</li></ul><p id="total">$3</p>`);
  const has = Shop.items.passes((items, m) => items.includes(m.get(Picked.item)), "the picked item");
  await runVerify([has], Done, page, mem, "list");
  mem.set(Picked.item, "z");
  await expect(runVerify([{ ...has, timeoutMs: 200 }], Done, page, mem, "list")).rejects.toThrow('  wanted  the picked item\n  saw     ["a","b"]');
});

test("a passing read check names the element its value came from, so the demo rings it", async ({ page }) => {
  await page.setContent(`<ul><li>a</li></ul><p id="total">$3</p>`);
  takeCheckedElements(page);
  await runVerify([Shop.total.is(3)], Done, page, new MemPage(), "total");
  expect(takeCheckedElements(page)).toEqual([{ check: "read(traitReadShop.total)", selector: "#total", says: "traitReadShop.total = 3" }]);
});
