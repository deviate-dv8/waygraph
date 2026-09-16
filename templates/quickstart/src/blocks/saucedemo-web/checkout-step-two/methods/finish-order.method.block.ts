import { defineMethodBlock, checkpoint, Trait, narrate } from "waygraph";
import type { CheckoutOverviewPage, OrderComplete } from "../../../../states/checkout.states.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/checkout-step-two/methods/  (= /checkout-step-two.html)
 *
 * Places the order on the overview page - form/finish click, not a NavBlock.
 */
export const FinishOrderBlock = defineMethodBlock<CheckoutOverviewPage, OrderComplete>({
  name: "finish-order",
  description: "Places the order and confirms the 'Thank you for your order!' completion page.",
  instruction: {
    async act(page) {
      const finishButton = page.locator("#finish");
      await narrate(finishButton, "Placing the order", () => finishButton.click());
    },
    resolve: () => checkpoint("OrderComplete"),
    verify: [Trait.text(".complete-header", "Thank you for your order!")],
    highlights: () => [{ selector: ".complete-header", label: "remember this: order confirmed" }],
  },
});
