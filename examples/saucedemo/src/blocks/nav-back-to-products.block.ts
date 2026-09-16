import { defineNavBlock, Trait } from "waygraph";
import type { LoggedIn } from "../states/checkout.states.js";

// click, not url - the order-complete page's own "Back Home" button
// genuinely takes you back to /inventory.html. A url-based NavBlock here
// would teleport straight to that URL without ever proving this button
// actually works; click proves the app's own navigation path does.
export const NavBackToProductsBlock = defineNavBlock<LoggedIn>({
  name: "nav-back-to-products",
  description: "Clicks 'Back Home' on the order confirmation page.",
  checkpoint: "LoggedIn",
  click: "#back-to-products",
  verify: [Trait.url({ pathname: "/inventory.html" })],
});
