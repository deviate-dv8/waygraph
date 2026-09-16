import { defineBlock, checkpoint, Trait } from "waygraph";
import type { CheckoutInfoPage, CheckoutOverviewPage } from "../../states/checkout.states.js";

// Fills the shipping info form and continues - never navigates
// (nav-checkout-info.block.ts already got here). Replaces the old
// checkout-info.action.block.ts, which used to also click the cart link and
// the checkout button itself - three real page transitions bundled into one
// non-atomic Block.
export const SubmitCheckoutInfoBlock = defineBlock<CheckoutInfoPage, CheckoutOverviewPage>({
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
