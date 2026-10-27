import { defineNavBlock, Trait } from "waygraph";
import { LoggedIn } from "../../../states/checkout.states.js";
import { InventorySel } from "./methods/inventory-items.js";

/**
 * Kind: Nav
 * Helper: defineNavBlock
 * Route: saucedemo-web/inventory/  (= /inventory.html)
 *
 * Straight to the catalogue - for a flow that starts signed in (`map({ as })`), which has no login form to submit.
 */
export const NavInventoryBlock = defineNavBlock({
  name: "nav-inventory",
  description: "Opens the product catalogue (needs a signed-in session).",
  checkpoint: LoggedIn,
  url: "/inventory.html",
  verify: [Trait.url({ pathname: "/inventory.html" }), Trait.visible(InventorySel.list)],
});
