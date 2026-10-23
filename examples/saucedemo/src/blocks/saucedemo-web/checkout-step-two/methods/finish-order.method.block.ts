import { defineMethodBlock, Trait, narrate } from "waygraph";
import {
  CheckoutOverviewPage,
  OrderComplete,
} from "../../../../states/checkout.states.js";
import { CheckoutOverviewSel } from "./checkout-overview.sel.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/checkout-step-two/methods/  (= /checkout-step-two.html)
 *
 * Places the order on the overview page - form/finish click, not a NavBlock.
 */
export const FinishOrderBlock = defineMethodBlock({
  name: "finish-order",
  description:
    "Places the order and confirms the 'Thank you for your order!' completion page.",
  from: CheckoutOverviewPage,
  to: OrderComplete,
  instruction: {
    async act(page) {
      const finishButton = page.locator(CheckoutOverviewSel.finishBtn);
      await narrate(finishButton, "Placing the order", () =>
        finishButton.click(),
      );
    },
    verify: [
      Trait.text(
        CheckoutOverviewSel.completeHeader,
        "Thank you for your order!",
      ),
    ],
    // Shown AFTER act (order already placed) - selectors must match the
    // completion page, not #finish on the overview.
    slides: [
      {
        caption: "Checkout is a short pipeline",
        detail: "Cart -> info -> overview -> done. You just placed the order.",
        tag: "YAP",
        tone: "info",
        duration: true,
      },
      {
        caption: "Completion page is the durable proof",
        detail:
          "tone: success - the thank-you header is what verify asserts on.",
        tag: "YAP",
        tone: "success",
        selector: CheckoutOverviewSel.completeHeader,
        duration: 2500,
        fastMode: 700,
      },
      {
        caption: "Episode continues after this yap",
        detail: "Next step rings the same banner, then you move on.",
        tag: "YAP",
        tone: "planned",
        selector: CheckoutOverviewSel.completeHeader,
        duration: true,
        fastMode: 500,
      },
    ],
  },
});
