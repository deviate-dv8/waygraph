import { definePageBlock, Trait } from "waygraph";
import { OrderComplete } from "../../../states/checkout.states.js";
import { NavBackToProductsBlock } from "../inventory-item/nav-back-to-products.block.js";

/** The order confirmation: "Back Home" returns to the inventory. */
export const Confirmation = definePageBlock({
  name: "page-order-complete",
  description: "The order confirmation.",
  checkpoint: OrderComplete,
  verify: [Trait.url({ pathname: "/checkout-complete.html" })],
  methods: {
    backHome: () => NavBackToProductsBlock,
  },
});
