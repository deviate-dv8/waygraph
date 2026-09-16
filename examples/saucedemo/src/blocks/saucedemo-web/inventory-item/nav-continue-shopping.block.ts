import { defineNavClickBlock, Trait } from "waygraph";
import type { LoggedIn } from "../../../states/checkout.states.js";

/**
 * Kind: Nav
 * Helper: defineNavClickBlock
 * Route: saucedemo-web/inventory-item/  (lands on /inventory.html)
 *
 * click, not url - cart page "Continue Shopping" proves the app's own path.
 */
export const NavContinueShoppingBlock = defineNavClickBlock<LoggedIn>({
  name: "nav-continue-shopping",
  description: "Clicks 'Continue Shopping' on the cart page.",
  checkpoint: "LoggedIn",
  click: "#continue-shopping",
  verify: [Trait.url({ pathname: "/inventory.html" })],
});
