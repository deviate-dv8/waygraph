import { definePageBlock, Trait } from "waygraph";
import { ItemDetailPage } from "../../../states/checkout.states.js";
import { NavItemDetailBlock } from "../inventory/nav-item-detail.block.js";
import { NavBackToInventoryBlock } from "./nav-back-to-inventory.block.js";

/** One product's page: opened from the inventory, left with "Back to products". */
export const ItemDetail = definePageBlock({
  name: "page-item-detail",
  description: "One product's detail page.",
  checkpoint: ItemDetailPage,
  nav: NavItemDetailBlock,
  verify: [Trait.url({ pathname: "/inventory-item.html" })],
  methods: {
    backToProducts: () => NavBackToInventoryBlock,
  },
});
