import { defineMethodBlock, checkpoint, Trait } from "waygraph";
import type { CheckoutInfoPage, CheckoutOverviewPage } from "../../../../states/checkout.states.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/checkout-step-one/methods/  (= /checkout-step-one.html)
 *
 * Fills shipping form and continues - never navigates itself
 * (nav-checkout-info already got here).
 */
export const SubmitCheckoutInfoBlock = defineMethodBlock<CheckoutInfoPage, CheckoutOverviewPage>({
  name: "submit-checkout-info",
  description: "Fills in the shipping info form and continues to the order overview.",
  instruction: {
    async act(page) {
      await page.locator("#first-name").fill("Ada");
      await page.locator("#last-name").fill("Lovelace");
      await page.locator("#postal-code").fill("1000");
      await page.locator("#continue").click();
    },
    resolve: () => checkpoint("CheckoutOverviewPage"),
    verify: [Trait.url({ pathname: "/checkout-step-two.html" })],
  },
});
