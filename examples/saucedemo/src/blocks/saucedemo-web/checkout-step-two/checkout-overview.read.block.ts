import { defineReadBlock } from "waygraph";
import { CheckoutOverviewPage } from "../../../states/checkout.states.js";
import { CheckoutOverview } from "../../../states/checkout.reads.js";
import { CheckoutOverviewSel } from "./methods/checkout-overview.sel.js";

/**
 * Kind: Read
 * Helper: defineReadBlock
 * Route: saucedemo-web/checkout-step-two/  (= /checkout-step-two.html)
 *
 * The order before it is placed: each line and the total.
 */
export const CheckoutOverviewReadBlock = defineReadBlock({
  name: "read-checkout-overview",
  description: "Each line of the order and its total.",
  from: CheckoutOverviewPage,
  instruction: {
    read: (ctx) =>
      CheckoutOverview({
        items: ctx.page.list(CheckoutOverviewSel.item, (row) => ({
          name: row.text(CheckoutOverviewSel.itemName),
          price: row.number(CheckoutOverviewSel.itemPrice),
        })),
        total: ctx.page.number(CheckoutOverviewSel.total),
      }),
  },
});
