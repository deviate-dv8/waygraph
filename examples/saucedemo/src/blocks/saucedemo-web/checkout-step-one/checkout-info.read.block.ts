import { defineReadBlock } from "waygraph";
import { CheckoutInfoPage } from "../../../states/checkout.states.js";
import { CheckoutInfo } from "../../../states/checkout.reads.js";
import { CheckoutInfoSel } from "./methods/checkout-info.sel.js";

/**
 * Kind: Read
 * Helper: defineReadBlock
 * Route: saucedemo-web/checkout-step-one/  (= /checkout-step-one.html)
 *
 * The shipping form as data: what each field holds and the error it shows (missing when there is none).
 */
export const CheckoutInfoReadBlock = defineReadBlock({
  name: "read-checkout-info",
  description: "What the first name, last name and postal code fields hold; the form's error.",
  from: CheckoutInfoPage,
  instruction: {
    read: (ctx) =>
      CheckoutInfo({
        firstName: ctx.page.value(CheckoutInfoSel.firstName),
        lastName: ctx.page.value(CheckoutInfoSel.lastName),
        postalCode: ctx.page.value(CheckoutInfoSel.postalCode),
        error: ctx.page.text(CheckoutInfoSel.error),
      }),
  },
});
