import { definePageBlock, Trait } from "waygraph";
import { CheckoutOverviewSel } from "./_sel.js";
import { finishOrder } from "./_methods/finish-order.method.block.js";

/** Checkout step two: the order's summary, reached by submitting step one. */
export const CheckoutOverview = definePageBlock({
  name: "page-checkout-overview",
  description: "Checkout step two - the summary; Finish places the order.",
  checkpoint: "CheckoutOverviewPage",
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
    finishOrder: finishOrder(self),
  })
});
