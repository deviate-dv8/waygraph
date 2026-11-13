import { definePageBlock, Trait } from "waygraph";
import { ItemDetailSel } from "./_sel.js";
import { backToProducts } from "./_methods/back-to-products.method.block.js";

/** One product's page: opened from the inventory (`Inventory.do.openDetail`), left with "Back to products". */
export const ItemDetail = definePageBlock({
  name: "page-item-detail",
  description: "One product's detail page.",
  checkpoint: "ItemDetailPage",
  screenshot: true,
  from: ["InventoryPage"],
  verify: [Trait.url({ pathname: "/inventory-item.html" })],
  read: (ctx) => ({
    name: ctx.page.text(ItemDetailSel.name),
    price: ctx.page.number(ItemDetailSel.price),
    description: ctx.page.text(ItemDetailSel.description),
    inCart: ctx.page.visible(ItemDetailSel.removeBtn),
  }),
  readAs: "itemDetail",
  do: (self) => ({ backToProducts: backToProducts(self) }),
});
