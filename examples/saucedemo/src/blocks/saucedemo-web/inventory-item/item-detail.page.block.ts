import { definePageBlock, Trait } from "waygraph";
import { ItemDetailPage } from "../../../states/checkout.states.js";
import { NavItemDetailBlock } from "../inventory/nav-item-detail.block.js";
import { NavBackToInventoryBlock } from "./nav-back-to-inventory.block.js";
import { ItemDetailSel } from "./item-detail.sel.js";

/** One product's page: opened from the inventory, left with "Back to products". */
export const ItemDetail = definePageBlock({
  name: "page-item-detail",
  description: "One product's detail page.",
  checkpoint: ItemDetailPage,
  screenshot: true,
  nav: NavItemDetailBlock,
  verify: [Trait.url({ pathname: "/inventory-item.html" })],
  read: (ctx) => ({
      name: ctx.page.text(ItemDetailSel.name),
      price: ctx.page.number(ItemDetailSel.price),
      description: ctx.page.text(ItemDetailSel.description),
      inCart: ctx.page.visible(ItemDetailSel.removeBtn),
    }),
  readAs: "itemDetail",
  do: () => ({ backToProducts: NavBackToInventoryBlock })
});
