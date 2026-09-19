import { defineNavClickBlock, Trait } from "waygraph";
import type { LoggedIn } from "../../../states/checkout.states.js";
import { ItemDetailSel } from "./item-detail.sel.js";

/**
 * Kind: Nav
 * Helper: defineNavClickBlock
 * Route: saucedemo-web/inventory-item/  (= /inventory-item.html From)
 *
 * click, not url - detail page "Back to products". Separate Block from
 * nav-back-to-products (different From Checkpoint; atomic convention).
 */
export const NavBackToInventoryBlock = defineNavClickBlock<LoggedIn>({
  name: "nav-back-to-inventory",
  description: "Clicks 'Back to products' on the item detail page.",
  checkpoint: "LoggedIn",
  click: ItemDetailSel.backToProductsBtn,
  verify: [Trait.url({ pathname: "/inventory.html" })],
});
