// The page object: `read` first, then `do` and `expects` as functions of the page, which sees the read's keys typed.
import { definePageBlock } from "../src/engine/block/kinds/page.js";
import { defineMethodBlock } from "../src/engine/block/kinds/method.js";
import { checkpoint } from "../src/engine/checkpoint/checkpoint.js";

const Cart = checkpoint("Cart");
const Clear = defineMethodBlock({ name: "clear", from: Cart, to: Cart, instruction: { async act() {} } });

export const CartPage = definePageBlock({
  name: "page-cart",
  checkpoint: Cart,
  url: "/cart",
  read: (ctx) => ({ count: ctx.page.number(".count"), title: ctx.page.text("h1") }),
  do: () => ({ clear: Clear, again: () => Clear }),
  expects: (page) => ({ empty: page.read.count.is(0) }),
});

// Typed by what each field reads.
CartPage.read.count.is(3);
CartPage.read.title.is("Cart");
// @ts-expect-error - count is a number
CartPage.read.count.is("three");
// @ts-expect-error - no such field
CartPage.read.nothing;
CartPage.do.clear;
CartPage.expects.empty;
