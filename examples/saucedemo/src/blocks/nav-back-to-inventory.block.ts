import { defineNavBlock, Trait } from "waygraph";
import type { LoggedIn } from "../states/checkout.states.js";

// click, not url - the item detail page's own real "Back to products"
// button. Same selector nav-back-to-products.block.ts uses from
// OrderComplete - a different From state, so a separate Block, per the
// atomic convention (each Block declares its own In/Out contract even when
// the click target happens to coincide).
export const NavBackToInventoryBlock = defineNavBlock<LoggedIn>({
  name: "nav-back-to-inventory",
  description: "Clicks 'Back to products' on the item detail page.",
  checkpoint: "LoggedIn",
  click: "#back-to-products",
  verify: [Trait.url({ pathname: "/inventory.html" })],
});
