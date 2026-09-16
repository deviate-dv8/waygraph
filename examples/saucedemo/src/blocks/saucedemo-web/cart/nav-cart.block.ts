import { defineNavClickBlock, Trait } from "waygraph";
import type { CartPage } from "../../../states/checkout.states.js";

/**
 * Kind: Nav
 * Helper: defineNavClickBlock
 * Route: saucedemo-web/cart/  (= /cart.html)
 *
 * click, not url - header cart link from inventory-adjacent pages.
 */
export const NavCartBlock = defineNavClickBlock<CartPage>({
  name: "nav-cart",
  description: "Clicks the cart link in the header.",
  checkpoint: "CartPage",
  click: ".shopping_cart_link",
  verify: [Trait.url({ pathname: "/cart.html" })],
});
