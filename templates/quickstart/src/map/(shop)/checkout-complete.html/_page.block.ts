import { definePageBlock, Trait } from "waygraph";
import { CheckoutOverviewSel } from "../checkout-step-two.html/_sel.js";
import { backHome } from "./_methods/back-home.method.block.js";

/** The order confirmation: "Back Home" returns to the inventory. */
export const Confirmation = definePageBlock({
  name: "page-order-complete",
  description: "The order confirmation.",
  checkpoint: "OrderComplete",
  screenshot: true,
  from: ["CheckoutOverviewPage"],
  verify: [Trait.url({ pathname: "/checkout-complete.html" })],
  read: (ctx) => ({ header: ctx.page.text(CheckoutOverviewSel.completeHeader) }),
  readAs: "orderDone",
  do: (self) => ({ backHome: backHome(self) }),
});
