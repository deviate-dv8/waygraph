import { defineMethodBlock, checkpoint, Trait } from "waygraph";
import type { ItemInCart, CartEmpty } from "../../../../states/demo.states.js";
import { DemoSel } from "../_sel.js";

export const ClearCartBlock = defineMethodBlock<ItemInCart, CartEmpty>({
  name: "clear-cart",
  description: "Clears every item via the Clear cart control.",
  instruction: {
    async act(page) {
      await page.locator(DemoSel.clear).click();
    },
    resolve: () => checkpoint("CartEmpty"),
    verify: [Trait.text(DemoSel.cartCount, "0")],
  },
});
