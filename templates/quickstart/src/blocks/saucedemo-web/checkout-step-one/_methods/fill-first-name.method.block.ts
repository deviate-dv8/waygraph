import type { PageHandle } from "waygraph";
import { CheckoutInfoSel } from "../methods/checkout-info.sel.js";

export const fillFirstName = (self: PageHandle<"CheckoutInfoPage">) =>
  self.method({
    name: "fill-first-name",
    description: "Fills the first name field on the shipping info form.",
    async act(page) {
      await page.locator(CheckoutInfoSel.firstName).fill("Ada");
    },
  });
