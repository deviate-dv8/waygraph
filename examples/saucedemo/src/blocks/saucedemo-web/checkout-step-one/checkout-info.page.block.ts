import { definePageBlock, Trait } from "waygraph";
import { CheckoutInfoPage } from "../../../states/checkout.states.js";
import { NavCheckoutInfoBlock } from "../cart/nav-checkout-info.block.js";
import { FillFirstNameBlock } from "./methods/fill-first-name.method.block.js";
import { FillLastNameBlock } from "./methods/fill-last-name.method.block.js";
import { FillPostalCodeBlock } from "./methods/fill-postal-code.method.block.js";
import { SubmitCheckoutInfoBlock } from "./methods/submit-checkout-info.method.block.js";
import { CheckoutInfoSel } from "./methods/checkout-info.sel.js";

/** Checkout step one: who and where the order goes. */
export const CheckoutInfo = definePageBlock({
  name: "page-checkout-info",
  description: "Checkout step one - name and postal code.",
  checkpoint: CheckoutInfoPage,
  screenshot: true,
  nav: NavCheckoutInfoBlock,
  verify: [Trait.url({ pathname: "/checkout-step-one.html" })],
  do: () => ({ fillFirstName: FillFirstNameBlock, fillLastName: FillLastNameBlock, fillPostalCode: FillPostalCodeBlock, submit: SubmitCheckoutInfoBlock }),
  read: (ctx) => ({
    firstName: ctx.page.value(CheckoutInfoSel.firstName),
    lastName: ctx.page.value(CheckoutInfoSel.lastName),
    postalCode: ctx.page.value(CheckoutInfoSel.postalCode),
    error: ctx.page.text(CheckoutInfoSel.error),
  }),
  readAs: "checkoutInfo"
});
