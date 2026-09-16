import { defineNavBlock, Trait } from "waygraph";
import type { CartPage } from "../states/checkout.states.js";

// click, not url - the real "Cart" link in the page header, clickable from
// any inventory-adjacent page (with or without an item already added).
export const NavCartBlock = defineNavBlock<CartPage>({
  name: "nav-cart",
  description: "Clicks the cart link in the header.",
  checkpoint: "CartPage",
  click: ".shopping_cart_link",
  verify: [Trait.url({ pathname: "/cart.html" })],
});
