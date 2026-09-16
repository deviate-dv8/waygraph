import { defineNavBlock, Trait } from "waygraph";
import type { CartPage } from "../states/checkout.states.js";

export const NavCartBlock = defineNavBlock<CartPage>({
  name: "nav-cart",
  description: "Clicks the cart link in the header.",
  checkpoint: "CartPage",
  click: ".shopping_cart_link",
  verify: [Trait.url({ pathname: "/cart.html" })],
});
