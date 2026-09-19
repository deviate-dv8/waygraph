import { defineMethodBlock, checkpoint } from "waygraph";
import type { CheckoutInfoPage } from "../../../../states/checkout.states.js";
import { CheckoutInfoSel } from "./checkout-info.sel.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/checkout-step-one/methods/  (= /checkout-step-one.html)
 *
 * Fills the postal code field only - self-loop on CheckoutInfoPage.
 */
export const FillPostalCodeBlock = defineMethodBlock<CheckoutInfoPage, CheckoutInfoPage>({
  name: "fill-postal-code",
  description: "Fills the postal code field on the shipping info form.",
  instruction: {
    async act(page) {
      await page.locator(CheckoutInfoSel.postalCode).fill("1000");
    },
    resolve: () => checkpoint("CheckoutInfoPage"),
  },
});
