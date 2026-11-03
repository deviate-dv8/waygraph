import { definePageBlock, Trait } from "waygraph";
import { CartPage } from "../../../states/checkout.states.js";
import { NavCartBlock } from "./nav-cart.block.js";
import { NavContinueShoppingBlock } from "../inventory-item/nav-continue-shopping.block.js";

/** The cart: open it from the header, go back to shopping; checking out opens CheckoutInfo. */
export const Cart = definePageBlock({
  name: "page-cart",
  description: "The cart - what's in it, back to shopping, on to checkout.",
  checkpoint: CartPage,
  nav: NavCartBlock,
  verify: [Trait.url({ pathname: "/cart.html" })],
  methods: {
    continueShopping: () => NavContinueShoppingBlock,
  },
});
