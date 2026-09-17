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
        duration: true,
      },
    },
    // Shown AFTER act (order already placed) - selectors must match the
    // completion page, not #finish on the overview.
    slides: [
      {
        caption: "Checkout is a short pipeline",
        detail: "Cart -> info -> overview -> done. You just placed the order.",
        tag: "YAP",
        duration: true,
      },
      {
        caption: "Completion page is the durable proof",
        detail: "The thank-you header is what verify asserts on.",
        tag: "YAP",
        selector: ".complete-header",
        duration: 2500,
        fastMode: 700,
      },
      {
        caption: "Episode continues after this yap",
        detail: "Next step rings the same banner, then you move on.",
        tag: "YAP",
        selector: ".complete-header",
        duration: true,
        fastMode: 500,
      },
    ],
  },
});
