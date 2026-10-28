import { defineReadBlock } from "waygraph";
import { CartEmpty, Home, HomeVerified, ItemInCart } from "../../../states/demo.states.js";
import { DemoSel } from "./_sel.js";
import { HomeRead } from "./_reads.js";

/** The home page as data: after every step that lands here, and from `waygraph auto read <session>`. */
export const HomeReadBlock = defineReadBlock({
  name: "read-home",
  description: "The title, the cart count, and each item with whether it is in the cart.",
  from: [Home, HomeVerified, ItemInCart, CartEmpty],
  instruction: {
    read: (ctx) =>
      HomeRead({
        title: ctx.page.text(DemoSel.title),
        cartCount: ctx.page.number(DemoSel.cartCount),
        items: ctx.page.list(`${DemoSel.catalog} li.item`, (row) => ({
          name: row.text(".name"),
          inCart: row.visible("button.remove"),
        })),
      }),
  },
});
