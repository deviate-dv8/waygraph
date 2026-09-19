import { defineMethodBlock, checkpoint, Trait } from "waygraph";
import type { CheckoutInfoPage, CheckoutOverviewPage } from "../../../../states/checkout.states.js";
import { CheckoutInfoSel } from "./checkout-info.sel.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/checkout-step-one/methods/  (= /checkout-step-one.html)
 *
 * Clicks Continue only - fields are filled by fill-first-name /
 * fill-last-name / fill-postal-code (each its own Block). One Block, one
 * action: submit.
 */
export const SubmitCheckoutInfoBlock = defineMethodBlock<CheckoutInfoPage, CheckoutOverviewPage>({
  name: "submit-checkout-info",
  description: "Continues from the shipping info form to the order overview.",
  instruction: {
    async act(page) {
      await page.locator(CheckoutInfoSel.continueBtn).click();
    },
    resolve: () => checkpoint("CheckoutOverviewPage"),
    verify: [Trait.url({ pathname: "/checkout-step-two.html" })],
  },
});
