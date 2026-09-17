import { defineMethodBlock, checkpoint, Trait } from "waygraph";
import { DemoSel } from "../demo-sel.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: demo-web/methods/
 */
export const ClearCartBlock = defineMethodBlock({
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
