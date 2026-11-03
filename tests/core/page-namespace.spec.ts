import { test, expect } from "@playwright/test";
import { checkpoint, defineExpectBlock, defineMethodBlock, defineNavBlock, definePageBlock, Engine, MemPage, Trait } from "../../src/index.js";

const Shop = checkpoint("PageNsShop");
const Done = checkpoint("PageNsDone");
const did: string[] = [];

const NavShopBlock = defineNavBlock({
  name: "nav-page-ns-shop",
  checkpoint: Shop,
  url: "data:text/html,<h1>Shop</h1><p id=count>0</p>",
  verify: [Trait.visible("h1")],
});
const AddBlock = defineMethodBlock({ name: "page-ns-add", from: Shop, to: Shop, instruction: { async act() { did.push("add"); } } });
const CheckoutBlock = defineMethodBlock({ name: "page-ns-checkout", from: Shop, to: Done, instruction: { async act() { did.push("checkout"); } } });
const AssertHeadingBlock = defineExpectBlock({ name: "page-ns-heading", checkpoint: Shop, verify: [Trait.text("h1", "Shop")] });

const ShopPage = definePageBlock({
  name: "page-page-ns-shop",
  checkpoint: Shop,
  nav: NavShopBlock,
  methods: { add: () => AddBlock, checkout: CheckoutBlock },
  expects: { heading: () => AssertHeadingBlock },
});

test("a Page Block is the page's namespace: nav, do.<method> and expects.<name>, each its own Block type", async ({ page }) => {
  expect(ShopPage.nav).toBe(NavShopBlock);
  expect(ShopPage.do.add).toBe(AddBlock);
  expect(ShopPage.methods.map((m) => m.name)).toEqual(["page-ns-add", "page-ns-checkout"]);
  expect(ShopPage.expects.heading).toBe(AssertHeadingBlock);
  const flow = new Engine()
    .map().gotoPage(ShopPage.nav, { expect: [ShopPage.expects.heading] })
    .method(ShopPage.do.add)
    .method(ShopPage.do.checkout);
  expect(await flow.run(page.context(), new MemPage(), { page })).toEqual(Done);
  expect(did).toEqual(["add", "checkout"]);
  // Still typed step by step: checkout lands on Done, where the shop's methods don't fit.
  // @ts-expect-error Done is not the shop page
  expect(() => new Engine().map().gotoPage(ShopPage.nav).method(ShopPage.do.checkout).method(ShopPage.do.add)).toBeDefined();
});

test("a decorated Page Block keeps its namespace", () => {
  const checked = ShopPage.withVerify([Trait.visible("h1")]);
  expect(checked.do.checkout).toBe(CheckoutBlock);
  expect(checked.nav).toBe(NavShopBlock);
});
