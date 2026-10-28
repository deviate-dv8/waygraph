import { defineReadBlock } from "waygraph";
import { CartPage } from "../../../states/checkout.states.js";
import { Cart } from "../../../states/checkout.reads.js";

/**
 * Kind: Read
 * Helper: defineReadBlock
 * Route: saucedemo-web/cart/  (= /cart.html)
 *
 * The cart's lines: name, quantity and price.
 */
export const CartReadBlock = defineReadBlock({
  name: "read-cart",
  description: "Each line in the cart: name, quantity, price.",
  from: CartPage,
  instruction: {
    read: (ctx) =>
      Cart({
        lines: ctx.page.list(".cart_item", (row) => ({
          name: row.text(".inventory_item_name"),
          qty: row.number(".cart_quantity"),
          price: row.number(".inventory_item_price"),
        })),
      }),
  },
});
