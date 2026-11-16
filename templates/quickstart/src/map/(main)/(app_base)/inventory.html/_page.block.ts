import { definePageBlock, Trait } from "waygraph";
import { InventorySel } from "./_sel.js";
import { addToCart } from "./_methods/add-to-cart.method.block.js";
import { removeFromCart } from "./_methods/remove-from-cart.method.block.js";
import { addAllToCart } from "./_methods/add-all-to-cart.method.block.js";
import { removeAllFromCart } from "./_methods/remove-all-from-cart.method.block.js";
import { openDetail } from "./_methods/open-detail.method.block.js";

/** The catalogue after sign-in: add and remove products one by one or all at once, open one's detail page. */
export const Inventory = definePageBlock({
  name: "page-inventory",
  description: "The inventory catalogue.",
  checkpoint: "InventoryPage",
  screenshot: true,
  url: "/inventory.html",
  verify: [Trait.url({ pathname: "/inventory.html" }), Trait.visible(InventorySel.list)],
  read: (ctx) => ({
    items: ctx.page.list(InventorySel.card, (row) => ({
      name: row.text(InventorySel.name),
      price: row.number(".inventory_item_price"),
      inCart: row.visible(InventorySel.removeBtnPrefix),
    })),
    sort: ctx.page.value(".product_sort_container"),
  }),
  readAs: "catalog",
  do: (self) => ({
    addToCart: addToCart(self),
    removeFromCart: removeFromCart(self),
    addAllToCart: addAllToCart(self),
    removeAllFromCart: removeAllFromCart(self),
    openDetail: openDetail(self),
  }),
});
