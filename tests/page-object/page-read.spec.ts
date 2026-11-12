import { test, expect } from "@playwright/test";
import { checkpoint, definePageBlock, defineMethodBlock, Engine, MemPage, Trait } from "../../src/index.js";
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

test("a page that is its own Checkpoint writes its Methods inline: named by key, from/to default to the page", async ({ context, page }) => {
  const Own = definePageBlock({
    name: "page-po-own",
    checkpoint: "PoOwn",
    do: (p) => ({
      fillName: p.method({ async act(pg) { await pg.setContent(`<input id="n"><p id="r"></p>`); await pg.locator("#n").fill("x"); } }),
      goAway: p.method({ to: "PoElsewhere", async act() {} }),
    }),
  });
  expect(Own.checkpoint).toEqual({ __state: "PoOwn" });
  expect(Own.do.fillName.name).toBe("po-own-fill-name");
  expect(Own.methods.map((m) => m.name)).toEqual(["po-own-fill-name", "po-own-go-away"]);
  expect(await new Engine().map().gotoPage(Own).method(Own.do.fillName).run(context, new MemPage(), { page })).toEqual({ __state: "PoOwn" });
  expect(await new Engine().map().gotoPage(Own).method(Own.do.goAway).run(context, new MemPage(), { page })).toEqual({ __state: "PoElsewhere" });
});

test("page.expect writes an expectation in the page: a Block named for the page and key, judging the page", async ({ context, page }) => {
  const Shelf = definePageBlock({
    name: "page-po-shelf",
    checkpoint: "PoShelf",
    do: (p) => ({ nothing: p.method({ async act(pg) { await pg.setContent(`<ul><li>a</li></ul>`); } }) }),
    expects: (p) => ({ listed: p.expect({ description: "A row is listed.", verify: [Trait.visible("li")] }) }),
  });
  expect(Shelf.expects.listed.name).toBe("expect-po-shelf-listed");
  expect(Shelf.expects.listed.description).toBe("A row is listed.");
  await new Engine().map().gotoPage(Shelf).method(Shelf.do.nothing, { expect: [Shelf.expects.listed] }).run(context, new MemPage(), { page });
});
