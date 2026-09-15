import { defineBlock, checkpoint, Trait } from "waygraph";
import type { ItemInCart, CheckoutInfoFilled } from "../../states/quickstart.states.js";

export const CheckoutInfoBlock = defineBlock<ItemInCart, CheckoutInfoFilled>({
  name: "checkout-info",
  description: "Goes to the cart, starts checkout, and fills in the shipping info form.",
  instruction: {
    async act(page) {
      await page.locator(".shopping_cart_link").click();
      await page.locator("#checkout").click();
      await page.locator("#first-name").fill("Ada");
      await page.locator("#last-name").fill("Lovelace");
      await page.locator("#postal-code").fill("1000");
      await page.locator("#continue").click();
    },
    resolve: () => checkpoint("CheckoutInfoFilled"),
    verify: [Trait.url({ pathname: "/checkout-step-two.html" })],
  },
});
