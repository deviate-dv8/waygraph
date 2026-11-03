import { definePageBlock, Trait } from "waygraph";
import { CheckoutOverviewPage } from "../../../states/checkout.states.js";
import { FinishOrderBlock } from "./methods/finish-order.method.block.js";

/** Checkout step two: the order's summary, reached by submitting step one. */
export const CheckoutOverview = definePageBlock({
  name: "page-checkout-overview",
  description: "Checkout step two - the summary; Finish places the order.",
  checkpoint: CheckoutOverviewPage,
  verify: [Trait.url({ pathname: "/checkout-step-two.html" })],
  methods: {
    finishOrder: () => FinishOrderBlock,
  },
});
