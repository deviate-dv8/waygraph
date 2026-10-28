import { defineReadBlock } from "waygraph";
import { ItemDetailPage } from "../../../states/checkout.states.js";
import { ItemDetail } from "../../../states/checkout.reads.js";
import { ItemDetailSel } from "./item-detail.sel.js";

/**
 * Kind: Read
 * Helper: defineReadBlock
 * Route: saucedemo-web/inventory-item/  (= /inventory-item.html)
 *
 * One product as data: its name, price, description and whether it is in the cart.
 */
export const ItemDetailReadBlock = defineReadBlock({
  name: "read-item-detail",
  description: "The product's name, price, description and whether it is in the cart.",
  from: ItemDetailPage,
  instruction: {
    read: (ctx) =>
      ItemDetail({
        name: ctx.page.text(ItemDetailSel.name),
        price: ctx.page.number(ItemDetailSel.price),
        description: ctx.page.text(ItemDetailSel.description),
        inCart: ctx.page.visible(ItemDetailSel.removeBtn),
      }),
  },
});
