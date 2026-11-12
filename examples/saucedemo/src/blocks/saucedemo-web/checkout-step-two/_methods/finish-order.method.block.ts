import type { PageHandle } from "waygraph";
import { Trait } from "waygraph";
import { CheckoutOverviewSel } from "../methods/checkout-overview.sel.js";

export const finishOrder = (self: PageHandle<"CheckoutOverviewPage">) =>
  self.method({
    to: "OrderComplete",
    name: "finish-order",
    description:
      "Places the order and confirms the 'Thank you for your order!' completion page.",
    async act(page) {
      const finishButton = page.locator(CheckoutOverviewSel.finishBtn);
      await finishButton.click();
    },
    verify: [
      Trait.text(
        CheckoutOverviewSel.completeHeader,
        "Thank you for your order!",
      ),
    ],
  });
