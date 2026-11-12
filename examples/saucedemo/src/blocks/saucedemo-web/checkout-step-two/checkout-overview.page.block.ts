import { definePageBlock, Trait } from "waygraph";
import { CheckoutOverviewPage } from "../../../states/checkout.states.js";
import { CheckoutOverviewSel } from "./methods/checkout-overview.sel.js";

/** Checkout step two: the order's summary, reached by submitting step one. */
export const CheckoutOverview = definePageBlock({
  name: "page-checkout-overview",
  description: "Checkout step two - the summary; Finish places the order.",
  checkpoint: CheckoutOverviewPage,
  screenshot: true,
  verify: [Trait.url({ pathname: "/checkout-step-two.html" })],
  read: (ctx) => ({
      items: ctx.page.list(CheckoutOverviewSel.item, (row) => ({
        name: row.text(CheckoutOverviewSel.itemName),
        price: row.number(CheckoutOverviewSel.itemPrice),
      })),
      total: ctx.page.number(CheckoutOverviewSel.total),
    }),
  readAs: "checkoutOverview",
  do: (self) => ({
  finishOrder: self.method({
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
  }),
  })
});
