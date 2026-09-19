import { Engine, start, end, withTitle, withHighlightFixtures } from "waygraph";
import type {
  LoggedIn,
  ItemInCart,
  CartPage,
  CheckoutInfoPage,
  CheckoutOverviewPage,
  OrderComplete,
} from "../states/checkout.states.js";
import { FfOwnerAuthBlock } from "../blocks/saucedemo-web/ff-owner-auth.block.js";
import { AddToCartBlock } from "../blocks/saucedemo-web/inventory/methods/add-to-cart.effect.block.js";
import { NavCartBlock } from "../blocks/saucedemo-web/cart/nav-cart.block.js";
import { NavCheckoutInfoBlock } from "../blocks/saucedemo-web/cart/nav-checkout-info.block.js";
import { FillFirstNameBlock } from "../blocks/saucedemo-web/checkout-step-one/methods/fill-first-name.method.block.js";
import { FillLastNameBlock } from "../blocks/saucedemo-web/checkout-step-one/methods/fill-last-name.method.block.js";
import { FillPostalCodeBlock } from "../blocks/saucedemo-web/checkout-step-one/methods/fill-postal-code.method.block.js";
import { SubmitCheckoutInfoBlock } from "../blocks/saucedemo-web/checkout-step-one/methods/submit-checkout-info.method.block.js";
import { FinishOrderBlock } from "../blocks/saucedemo-web/checkout-step-two/methods/finish-order.method.block.js";

const engine = new Engine({ headless: false, slowMo: 250 });

// Atomic nav/action per real URL after auth - the shape `waygraph auto` discovers.
// Auth is one FFCompose step (ff-owner-auth) so demo pacing skips login yap;
// use --ff-expand (or loginFlow) when you need per-step auth narration.
//
// Demo narration showcase (waygraph 0.11+ / FFCompose 0.12):
// - FF opaque: one gate for auth; stubs on interesting post-login blocks
// - Block stubs: add-to-cart / finish-order stubAfter
// - Flow fixtures: ticket-style captions
// - Slides on finish-order: multi-step yap with Next between slides
export const checkoutFlow = withHighlightFixtures(
  withTitle(
    engine.defineFlow<
      LoggedIn,
      ItemInCart,
      CartPage,
      CheckoutInfoPage,
      CheckoutInfoPage,
      CheckoutInfoPage,
      CheckoutInfoPage,
      CheckoutOverviewPage,
      OrderComplete
    >([
      start,
      FfOwnerAuthBlock,
      AddToCartBlock,
      NavCartBlock,
      NavCheckoutInfoBlock,
      FillFirstNameBlock,
      FillLastNameBlock,
      FillPostalCodeBlock,
      SubmitCheckoutInfoBlock,
      FinishOrderBlock,
      end,
    ]),
    "Owner: Full Checkout",
  ),
  {
    "ff-owner-auth": {
      stubAfter: {
        inventory: {
          label: "Signed in (fast-forward)",
          detail: "Auth collapsed via FFCompose - interesting work starts here.",
          tag: "AC",
          duration: true,
        },
      },
    },
    // Kept for --ff-expand (inners become separate steps again: nav-login,
    // fill-username, fill-password, submit-login).
    "fill-username": {
      stubBefore: {
        username: {
          label: "Demo user",
          detail: "standard_user from Mem - library block stays neutral.",
          tag: "AC",
          duration: true,
        },
      },
    },
    "fill-password": {
      stubBefore: {
        password: { label: "Password", detail: "Filled from Mem credentials.", duration: 1500 },
      },
    },
    "submit-login": {
      stubBefore: {
        submit: { label: "Sign in", tag: "GATE", duration: true, fastMode: 500 },
      },
    },
    "add-to-cart": {
      stubAfter: {
        badge: {
          label: "Cart now has the item",
          detail: "Badge updates after Add to cart.",
          tag: "AC",
          duration: true,
        },
      },
    },
    "finish-order": {
      stubAfter: {
        thanks: {
          label: "Order placed",
          detail: "Completion header is the durable proof.",
          tag: "GATE",
          duration: 2500,
          fastMode: 700,
        },
      },
    },
  },
);
