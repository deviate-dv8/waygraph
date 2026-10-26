import { defineReadBlock } from "waygraph/beta";
import { ItemInCart, LoggedIn } from "../../../states/checkout.states.js";
import { Catalog } from "../../../states/checkout.reads.js";
import { InventorySel } from "./methods/inventory-items.js";

/**
 * Kind: Read (beta)
 * Helper: defineReadBlock
 * Route: saucedemo-web/inventory/  (= /inventory.html)
 *
 * The catalogue as data: every product with its price and whether it is in the cart, and the sort order.
 */
export const InventoryReadBlock = defineReadBlock({
  name: "read-inventory",
  description: "Every product, its price and whether it is in the cart; the sort order.",
  from: [LoggedIn, ItemInCart],
  instruction: {
    read: (ctx) =>
      Catalog({
        items: ctx.list(InventorySel.card, (row) => ({
          name: row.text(InventorySel.name),
          price: row.number(".inventory_item_price"),
          inCart: row.visible(InventorySel.removeBtnPrefix),
        })),
        sort: ctx.value(".product_sort_container"),
      }),
  },
});
