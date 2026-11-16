import { definePageBlock, Trait } from "waygraph";
import { CartSel } from "./_sel.js";
import { continueShopping } from "./_methods/continue-shopping.method.block.js";

/** The cart: opened from the header, back to shopping, or on to checkout. */
export const Cart = definePageBlock({
  name: "page-cart",
  description: "The cart - what's in it, back to shopping, on to checkout.",
  checkpoint: "CartPage",
  screenshot: true,
  click: CartSel.cartLink,
  verify: [Trait.url({ pathname: "/cart.html" })],
  read: (ctx) => ({
    lines: ctx.page.list(".cart_item", (row) => ({
      name: row.text(".inventory_item_name"),
      qty: row.number(".cart_quantity"),
      price: row.number(".inventory_item_price"),
    })),
  }),
  readAs: "cart",
  do: (self) => ({ continueShopping: continueShopping(self) }),
});
