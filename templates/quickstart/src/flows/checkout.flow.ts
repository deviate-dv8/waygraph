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
import { SubmitCheckoutInfoBlock } from "../blocks/saucedemo-web/checkout-step-one/methods/submit-checkout-info.method.block.js";
import { FinishOrderBlock } from "../blocks/saucedemo-web/checkout-step-two/methods/finish-order.method.block.js";

const engine = new Engine({ headless: false, slowMo: 250 });

// Auth is one FFCompose step so demo pacing skips login; --ff-expand for inners.
export const checkoutFlow = withHighlightFixtures(
  withTitle(
    engine.defineFlow<
      LoggedIn,
      ItemInCart,
      CartPage,
      CheckoutInfoPage,
      CheckoutOverviewPage,
      OrderComplete
    >([
      start,
      FfOwnerAuthBlock,
      AddToCartBlock,
      NavCartBlock,
      NavCheckoutInfoBlock,
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
    "submit-login": {
      stubBefore: {
        username: {
          label: "Demo user",
          detail: "standard_user from Mem - library block stays neutral.",
          tag: "AC",
          duration: true,
        },
        password: { label: "Password", detail: "Filled from Mem credentials.", duration: 1500 },
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
