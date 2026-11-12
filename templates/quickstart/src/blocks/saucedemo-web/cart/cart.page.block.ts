import { definePageBlock, Trait } from "waygraph";
import { CartPage } from "../../../states/checkout.states.js";
import { NavContinueShoppingBlock } from "../inventory-item/nav-continue-shopping.block.js";
import { CartSel } from "./cart.sel.js";

/** The cart: open it from the header, go back to shopping; checking out opens CheckoutInfo. */
export const Cart = definePageBlock({
  name: "page-cart",
  description: "The cart - what's in it, back to shopping, on to checkout.",
  checkpoint: CartPage,
  screenshot: true,
  click: CartSel.cartLink,
  verify: [Trait.url({ pathname: "/cart.html" })],
  do: () => ({ continueShopping: NavContinueShoppingBlock }),
  read: (ctx) => ({
    lines: ctx.page.list(".cart_item", (row) => ({
      name: row.text(".inventory_item_name"),
      qty: row.number(".cart_quantity"),
      price: row.number(".inventory_item_price"),
    })),
  }),
  readAs: "cart"
});
