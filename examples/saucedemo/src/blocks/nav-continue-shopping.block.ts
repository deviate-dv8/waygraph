import { defineNavBlock, Trait } from "waygraph";
import type { LoggedIn } from "../states/checkout.states.js";

// click, not url - the cart page's own real "Continue Shopping" button.
export const NavContinueShoppingBlock = defineNavBlock<LoggedIn>({
  name: "nav-continue-shopping",
  description: "Clicks 'Continue Shopping' on the cart page.",
  checkpoint: "LoggedIn",
  click: "#continue-shopping",
  verify: [Trait.url({ pathname: "/inventory.html" })],
});
