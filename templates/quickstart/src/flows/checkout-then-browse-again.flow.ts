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
import { NavBackToProductsBlock } from "../blocks/nav-back-to-products.block.js";

const engine = new Engine({ headless: false, slowMo: 250 });

// Same atomic checkout chain, plus click-based nav-back-to-products
// (proves OrderComplete -> LoggedIn without a goto teleport).
export const checkoutThenBrowseAgainFlow = withTitle(
  engine.defineFlow<
    LoginPage,
    LoggedIn,
    ItemInCart,
    CartPage,
    CheckoutInfoPage,
    CheckoutOverviewPage,
    OrderComplete,
    LoggedIn
  >([
    start,
    NavLoginBlock,
    SubmitLoginForFlow,
    AddToCartBlock,
    NavCartBlock,
    NavCheckoutInfoBlock,
    SubmitCheckoutInfoBlock,
    FinishOrderBlock,
    NavBackToProductsBlock,
    end,
  ]),
  "Owner: Checkout, then click Back Home (click-based NavBlock demo)",
);
