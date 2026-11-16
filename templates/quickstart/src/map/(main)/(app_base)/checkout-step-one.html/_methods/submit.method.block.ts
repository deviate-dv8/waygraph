import type { PageHandle } from "waygraph";
import { Trait } from "waygraph";
import { CheckoutInfoSel } from "../_sel.js";

export const submit = (self: PageHandle<"CheckoutInfoPage">) =>
  self.method({
    to: "CheckoutOverviewPage",
    name: "submit-checkout-info",
    description: "Continues from the shipping info form to the order overview.",
    async act(page) {
      await page.locator(CheckoutInfoSel.continueBtn).click();
    },
    verify: [Trait.url({ pathname: "/checkout-step-two.html" })],
  });
