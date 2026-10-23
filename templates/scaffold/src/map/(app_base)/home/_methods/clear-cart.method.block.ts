import { defineMethodBlock, Trait } from "waygraph";
import { ItemInCart, CartEmpty } from "../../../../states/demo.states.js";
import { DemoSel } from "../_sel.js";

export const ClearCartBlock = defineMethodBlock({
  name: "clear-cart",
  description: "Clears every item via the Clear cart control.",
  from: ItemInCart,
  to: CartEmpty,
  instruction: {
    async act(page) {
      await page.locator(DemoSel.clear).click();
    },
    verify: [Trait.text(DemoSel.cartCount, "0")],
  },
});
