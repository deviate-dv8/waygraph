import { defineBlock, checkpoint, Trait } from "waygraph";
import type { LoggedIn, ItemInCart } from "../../states/quickstart.states.js";

export const AddToCartBlock = defineBlock<LoggedIn, ItemInCart>({
  name: "add-to-cart",
  description: "Adds the Sauce Labs Backpack to the cart and confirms the cart badge shows 1 item.",
  instruction: {
    async act(page) {
      await page.locator("#add-to-cart-sauce-labs-backpack").click();
    },
    resolve: () => checkpoint("ItemInCart"),
    verify: [Trait.text(".shopping_cart_badge", "1")],
    // Author-declared highlights - independent of verify's own pass/fail
    // check. "Remember this" moments a step-through overlay can call out
    // even when there's nothing to assert, just something worth pointing at.
    highlights: () => [{ selector: ".shopping_cart_badge", label: "remember this: cart now has 1 item" }],
  },
});
