import { defineMethodBlock, checkpoint, Trait } from "waygraph";
import type { ItemInCart, CartEmpty } from "../../../../states/demo.states.js";
import { DemoSel } from "../home.sel.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: (app_base)/home/methods/
 *
 * Real, pre-existing bug found live while verifying the Waygraph Map
 * rename: this Block had no explicit <In, Out> generic at all, so static
 * discovery (`waygraph graph`) always skipped it silently ("no ...generic
 * call found") - present before this move, not caused by it.
 */
export const ClearCartBlock = defineMethodBlock<ItemInCart, CartEmpty>({
  name: "clear-cart",
  description: "Clears every item via the Clear cart control.",
  instruction: {
    async act(page) {
      await page.locator(DemoSel.clear).click();
    },
    resolve: () => checkpoint("CartEmpty"),
    verify: [Trait.text(DemoSel.cartCount, "0")],
    stubBefore: {
      clear: { selector: DemoSel.clear, label: "Clear cart" },
    },
    stubAfter: {
      cart: { selector: DemoSel.cartCount, label: "Empty cart", duration: true },
    },
    stubOnError: {},
  },
});
