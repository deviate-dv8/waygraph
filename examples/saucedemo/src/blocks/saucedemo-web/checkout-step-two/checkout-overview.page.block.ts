import { definePageBlock, Trait } from "waygraph";
import { CheckoutOverviewPage } from "../../../states/checkout.states.js";
import { FinishOrderBlock } from "./methods/finish-order.method.block.js";
import { CheckoutOverviewSel } from "./methods/checkout-overview.sel.js";

/** Checkout step two: the order's summary, reached by submitting step one. */
export const CheckoutOverview = definePageBlock({
  name: "page-checkout-overview",
  description: "Checkout step two - the summary; Finish places the order.",
  checkpoint: CheckoutOverviewPage,
  screenshot: true,
  verify: [Trait.url({ pathname: "/checkout-step-two.html" })],
  do: () => ({ finishOrder: FinishOrderBlock }),
  read: (ctx) => ({
    items: ctx.page.list(CheckoutOverviewSel.item, (row) => ({
      name: row.text(CheckoutOverviewSel.itemName),
      price: row.number(CheckoutOverviewSel.itemPrice),
    })),
    total: ctx.page.number(CheckoutOverviewSel.total),
  }),
  readAs: "checkoutOverview"
});
