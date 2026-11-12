import { test, expect } from "@playwright/test";
import { checkpoint, definePageBlock, defineMethodBlock, MemPage } from "../../src/index.js";
import { runVerify } from "../../src/engine/trait/verify.js";
import { readBlocksFor } from "../../src/engine/read/read-block.js";

const Basket = checkpoint("PoBasket");
const Empty = defineMethodBlock({ name: "po-empty", from: Basket, to: Basket, instruction: { async act() {} } });

const BasketPage = definePageBlock({
  name: "page-po-basket",
  checkpoint: Basket,
  url: "/basket",
  read: (ctx) => ({ count: ctx.page.number(".count"), title: ctx.page.text("h1") }),
  do: () => ({ empty: Empty }),
  expects: (page) => ({ none: page.read.count.is(0) }),
});

test("a page's read is the keys of its own Read Block: checked, retried, named by the Checkpoint", async ({ page }) => {
  await page.setContent(`<h1>Basket</h1><p class="count">0</p>`);
  await runVerify([BasketPage.read.count.is(0), BasketPage.read.title.is("Basket")], Basket, page, new MemPage(), "basket");
  await expect(
    runVerify([{ ...BasketPage.read.count.is(2), timeoutMs: 200 }], Basket, page, new MemPage(), "basket"),
  ).rejects.toThrow(/poBasket\.count/);
});

test("do and expects are functions of the page, called on first use", () => {
  expect(BasketPage.do.empty).toBe(Empty);
  expect(Object.keys(BasketPage.expects)).toEqual(["none"]);
  expect(BasketPage.methods).toEqual([Empty]);
  expect(readBlocksFor(Basket.__state).map((b) => b.name)).toContain("read-po-basket");
});

test("a decorated copy of the page keeps its read, do and expects", () => {
  const copy = BasketPage.withVerify([]);
  expect(copy.do.empty).toBe(Empty);
  expect(copy.read.count.path).toBe("poBasket.count");
});

test("Page.go opens a page with params at one address", () => {
  const Req = definePageBlock({ name: "page-po-req", checkpoint: checkpoint("PoReq"), url: "/requests/:id" });
  const go = Req.go({ id: 42 });
  expect(go.name).toBe("page-po-req(42)");
  expect((go as unknown as { __waygraphNavUrl: string }).__waygraphNavUrl).toBe("/requests/42");
});
