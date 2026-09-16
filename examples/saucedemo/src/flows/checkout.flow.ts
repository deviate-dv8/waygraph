import { Engine, start, end, withTitle } from "waygraph";
import type {
  LoginPage,
  LoggedIn,
  ItemInCart,
  CartPage,
  CheckoutInfoPage,
  CheckoutOverviewPage,
  OrderComplete,
} from "../states/checkout.states.js";
import { NavLoginBlock } from "../blocks/nav-login.block.js";
import { SubmitLoginForFlow } from "../blocks/actions/submit-login-for-flow.js";
import { AddToCartBlock } from "../blocks/actions/add-to-cart.effect.block.js";
import { NavCartBlock } from "../blocks/nav-cart.block.js";
import { NavCheckoutInfoBlock } from "../blocks/nav-checkout-info.block.js";
import { SubmitCheckoutInfoBlock } from "../blocks/actions/submit-checkout-info.action.block.js";
import { FinishOrderBlock } from "../blocks/actions/finish-order.action.block.js";

const engine = new Engine({ headless: false, slowMo: 250 });

// Atomic nav/action per real URL - the shape `waygraph auto` discovers.
// Explicit type args: AddToCartBlock's In is Checkpoint<string> (wildcard),
// which trips defineFlow overload inference across a long array.
export const checkoutFlow = withTitle(
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
);
