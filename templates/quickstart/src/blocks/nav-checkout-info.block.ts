import { defineNavBlock, Trait } from "waygraph";
import type { CheckoutInfoPage } from "../states/checkout.states.js";

export const NavCheckoutInfoBlock = defineNavBlock<CheckoutInfoPage>({
  name: "nav-checkout-info",
  description: "Clicks Checkout on the cart page.",
  checkpoint: "CheckoutInfoPage",
  click: "#checkout",
  verify: [Trait.url({ pathname: "/checkout-step-one.html" })],
});
