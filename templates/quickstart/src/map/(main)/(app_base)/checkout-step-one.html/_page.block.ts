import { definePageBlock, Trait } from "waygraph";
import { CheckoutInfoSel } from "./_sel.js";
import { CartSel } from "../cart.html/_sel.js";
import { fillFirstName } from "./_methods/fill-first-name.method.block.js";
import { fillLastName } from "./_methods/fill-last-name.method.block.js";
import { fillPostalCode } from "./_methods/fill-postal-code.method.block.js";
import { submit } from "./_methods/submit.method.block.js";

/** Checkout step one: who and where the order goes. */
export const CheckoutInfo = definePageBlock({
  name: "page-checkout-info",
  description: "Checkout step one - name and postal code.",
  checkpoint: "CheckoutInfoPage",
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
    fillFirstName: fillFirstName(self),
    fillLastName: fillLastName(self),
    fillPostalCode: fillPostalCode(self),
    submit: submit(self),
  })
});
