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
  },
});
