import type { PageHandle } from "waygraph";
import { CheckoutInfoSel } from "../methods/checkout-info.sel.js";

export const fillLastName = (self: PageHandle<"CheckoutInfoPage">) =>
  self.method({
    name: "fill-last-name",
    description: "Fills the last name field on the shipping info form.",
    async act(page) {
      await page.locator(CheckoutInfoSel.lastName).fill("Lovelace");
    },
  });
