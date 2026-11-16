import type { PageHandle } from "waygraph";
import { CheckoutInfoSel } from "../_sel.js";

export const fillPostalCode = (self: PageHandle<"CheckoutInfoPage">) =>
  self.method({
    name: "fill-postal-code",
    description: "Fills the postal code field on the shipping info form.",
    async act(page) {
      await page.locator(CheckoutInfoSel.postalCode).fill("1000");
    },
  });
