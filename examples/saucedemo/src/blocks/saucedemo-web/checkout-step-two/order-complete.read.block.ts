import { defineReadBlock } from "waygraph";
import { OrderComplete } from "../../../states/checkout.states.js";
import { OrderDone } from "../../../states/checkout.reads.js";
import { CheckoutOverviewSel } from "./methods/checkout-overview.sel.js";

/**
 * Kind: Read
 * Helper: defineReadBlock
 * Route: saucedemo-web/checkout-complete  (= /checkout-complete.html, reached by finish-order)
 *
 * The confirmation as data: its header.
 */
export const OrderCompleteReadBlock = defineReadBlock({
  name: "read-order-complete",
  description: "The order confirmation's header.",
  from: OrderComplete,
  instruction: { read: (ctx) => OrderDone({ header: ctx.page.text(CheckoutOverviewSel.completeHeader) }) },
});
