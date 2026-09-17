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
    stubBefore: {
      finish: { selector: "#finish", label: "Finish" },
    },
    stubAfter: {
      thanks: {
        selector: ".complete-header",
        label: "Order confirmed",
        detail: "Thank you for your order!",
      },
    },
    slides: [
      {
        caption: "Checkout is a short pipeline",
        detail: "Cart → info → overview → done. Watch the last click place the order.",
        tag: "YAP",
      },
      {
        caption: "Finish submits the overview",
        detail: "This click is the only mutating step on this screen.",
        tag: "YAP",
        selector: "#finish",
      },
      {
        caption: "Completion banner is the proof",
        detail: "The next ring calls out the thank-you header.",
        tag: "YAP",
        selector: ".complete-header",
      },
    ],
  },
});
