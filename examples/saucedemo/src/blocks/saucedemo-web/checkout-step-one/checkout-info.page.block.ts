import { definePageBlock, Trait } from "waygraph";
import { CheckoutInfoPage } from "../../../states/checkout.states.js";
import { CheckoutInfoSel } from "./methods/checkout-info.sel.js";
import { CartSel } from "../cart/cart.sel.js";

/** Checkout step one: who and where the order goes. */
export const CheckoutInfo = definePageBlock({
  name: "page-checkout-info",
  description: "Checkout step one - name and postal code.",
  checkpoint: CheckoutInfoPage,
  screenshot: true,
  click: CartSel.checkoutBtn,
  verify: [Trait.url({ pathname: "/checkout-step-one.html" })],
  read: (ctx) => ({
      firstName: ctx.page.value(CheckoutInfoSel.firstName),
      lastName: ctx.page.value(CheckoutInfoSel.lastName),
      postalCode: ctx.page.value(CheckoutInfoSel.postalCode),
      error: ctx.page.text(CheckoutInfoSel.error),
    }),
  readAs: "checkoutInfo",
  do: (self) => ({
  fillFirstName: self.method({
  name: "fill-first-name",
  description: "Fills the first name field on the shipping info form.",
  async act(page) {
      await page.locator(CheckoutInfoSel.firstName).fill("Ada");
    },
  }),
  fillLastName: self.method({
  name: "fill-last-name",
  description: "Fills the last name field on the shipping info form.",
  async act(page) {
      await page.locator(CheckoutInfoSel.lastName).fill("Lovelace");
    },
  }),
  fillPostalCode: self.method({
  name: "fill-postal-code",
  description: "Fills the postal code field on the shipping info form.",
  async act(page) {
      await page.locator(CheckoutInfoSel.postalCode).fill("1000");
    },
  }),
  submit: self.method({
  to: "CheckoutOverviewPage",
  name: "submit-checkout-info",
  description: "Continues from the shipping info form to the order overview.",
  async act(page) {
      await page.locator(CheckoutInfoSel.continueBtn).click();
    },
  verify: [Trait.url({ pathname: "/checkout-step-two.html" })],
  }),
  })
});
