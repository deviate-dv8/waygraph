import { Engine, start, end, withTitle, withHighlightFixtures } from "waygraph";
import type {
  LoginPage,
  LoggedIn,
  ItemInCart,
  CartPage,
  CheckoutInfoPage,
  CheckoutOverviewPage,
  OrderComplete,
} from "../states/checkout.states.js";
import { NavLoginBlock } from "../blocks/saucedemo-web/nav-login.block.js";
import { SubmitLoginForFlow } from "../blocks/saucedemo-web/methods/submit-login-for-flow.js";
import { AddToCartBlock } from "../blocks/saucedemo-web/inventory/methods/add-to-cart.effect.block.js";
import { NavCartBlock } from "../blocks/saucedemo-web/cart/nav-cart.block.js";
import { NavCheckoutInfoBlock } from "../blocks/saucedemo-web/cart/nav-checkout-info.block.js";
import { SubmitCheckoutInfoBlock } from "../blocks/saucedemo-web/checkout-step-one/methods/submit-checkout-info.method.block.js";
import { FinishOrderBlock } from "../blocks/saucedemo-web/checkout-step-two/methods/finish-order.method.block.js";

const engine = new Engine({ headless: false, slowMo: 250 });

// Atomic nav/action per real URL - the shape `waygraph auto` discovers.
// Explicit type args: AddToCartBlock's In is Checkpoint<string> (wildcard),
// which trips defineFlow overload inference across a long array.
//
// Demo narration showcase (waygraph 0.11+):
// - Block stubs: submit-login stubBefore, add-to-cart / finish-order stubAfter
// - Flow fixtures: ticket-style captions (unlimited purposes on .flow.ts)
// - Slides on finish-order: multi-step yap with Next between slides
export const checkoutFlow = withHighlightFixtures(
  withTitle(
    engine.defineFlow<
      LoginPage,
      LoggedIn,
      ItemInCart,
      CartPage,
      CheckoutInfoPage,
      CheckoutOverviewPage,
      OrderComplete
    >([
      start,
      NavLoginBlock,
      SubmitLoginForFlow,
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
    "submit-login": {
      stubBefore: {
        username: {
          label: "Demo user",
          detail: "standard_user from Mem — library block stays neutral.",
          tag: "AC",
        },
        password: { label: "Password", detail: "Filled from Mem credentials." },
        submit: { label: "Sign in", tag: "GATE" },
      },
    },
    "add-to-cart": {
      stubAfter: {
        badge: {
          label: "Cart now has the item",
          detail: "Badge updates after Add to cart.",
          tag: "AC",
        },
      },
    },
    "finish-order": {
      stubAfter: {
        thanks: {
          label: "Order placed",
          detail: "Completion header is the durable proof.",
          tag: "GATE",
        },
      },
      // Optional: fixture can replace block slides; leave unset to use block slides.
    },
  },
);
