import { defineNavClickBlock, Trait } from "waygraph";
import type { CheckoutInfoPage } from "../../../states/checkout.states.js";

/**
 * Kind: Nav
 * Helper: defineNavClickBlock
 * Route: saucedemo-web/cart/  (click leaves /cart.html -> /checkout-step-one.html)
 *
 * Cart page "Checkout" button - owns the nav into step one.
 */
export const NavCheckoutInfoBlock = defineNavClickBlock<CheckoutInfoPage>({
  name: "nav-checkout-info",
  description: "Clicks 'Checkout' on the cart page.",
  checkpoint: "CheckoutInfoPage",
  click: "#checkout",
  verify: [Trait.url({ pathname: "/checkout-step-one.html" })],
});
