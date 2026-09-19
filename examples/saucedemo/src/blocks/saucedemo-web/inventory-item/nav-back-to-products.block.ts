import { defineNavClickBlock, Trait } from "waygraph";
import type { LoggedIn } from "../../../states/checkout.states.js";
import { ItemDetailSel } from "./item-detail.sel.js";

/**
 * Kind: Nav
 * Helper: defineNavClickBlock
 * Route: saucedemo-web/inventory-item/  (lands on /inventory.html)
 *
 * click, not url - order-complete "Back Home" proves the button path
 * (a url NavBlock would teleport without exercising the control).
 */
export const NavBackToProductsBlock = defineNavClickBlock<LoggedIn>({
  name: "nav-back-to-products",
  description: "Clicks 'Back Home' on the order confirmation page.",
  checkpoint: "LoggedIn",
  click: ItemDetailSel.backToProductsBtn,
  verify: [Trait.url({ pathname: "/inventory.html" })],
});
