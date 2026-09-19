import { defineMethodBlock, checkpoint } from "waygraph";
import type { CheckoutInfoPage } from "../../../../states/checkout.states.js";
import { CheckoutInfoSel } from "./checkout-info.sel.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/checkout-step-one/methods/  (= /checkout-step-one.html)
 *
 * Fills the last name field only - self-loop on CheckoutInfoPage.
 */
export const FillLastNameBlock = defineMethodBlock<CheckoutInfoPage, CheckoutInfoPage>({
  name: "fill-last-name",
  description: "Fills the last name field on the shipping info form.",
  instruction: {
    async act(page) {
      await page.locator(CheckoutInfoSel.lastName).fill("Lovelace");
    },
    resolve: () => checkpoint("CheckoutInfoPage"),
  },
});
