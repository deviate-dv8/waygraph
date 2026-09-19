import { defineMethodBlock, checkpoint } from "waygraph";
import type { CheckoutInfoPage } from "../../../../states/checkout.states.js";
import { CheckoutInfoSel } from "./checkout-info.sel.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/checkout-step-one/methods/  (= /checkout-step-one.html)
 *
 * Fills the first name field only - self-loop on CheckoutInfoPage. Continue
 * is its own Block (submit-checkout-info.method.block.ts).
 */
export const FillFirstNameBlock = defineMethodBlock<CheckoutInfoPage, CheckoutInfoPage>({
  name: "fill-first-name",
  description: "Fills the first name field on the shipping info form.",
  instruction: {
    async act(page) {
      await page.locator(CheckoutInfoSel.firstName).fill("Ada");
    },
    resolve: () => checkpoint("CheckoutInfoPage"),
  },
});
