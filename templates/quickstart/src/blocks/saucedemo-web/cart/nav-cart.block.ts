import { defineNavClickBlock, Trait } from "waygraph";
import { CartPage } from "../../../states/checkout.states.js";
import { CartSel } from "./cart.sel.js";

/**
 * Kind: Nav
 * Helper: defineNavClickBlock
 * Route: saucedemo-web/cart/  (= /cart.html)
 *
 * click, not url - header cart link from inventory-adjacent pages.
 */
export const NavCartBlock = defineNavClickBlock({
  name: "nav-cart",
  description: "Clicks the cart link in the header.",
  checkpoint: CartPage,
  click: CartSel.cartLink,
  verify: [Trait.url({ pathname: "/cart.html" })],
});
