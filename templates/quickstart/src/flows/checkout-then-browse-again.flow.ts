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
import { NavLoginBlock } from "../blocks/saucedemo-web/nav-login.block.js";
import { FillUsernameBlock } from "../blocks/saucedemo-web/methods/fill-username.method.block.js";
import { FillPasswordBlock } from "../blocks/saucedemo-web/methods/fill-password.method.block.js";
import { SubmitLoginForFlow } from "../blocks/saucedemo-web/methods/submit-login-for-flow.js";
import { AddToCartBlock } from "../blocks/saucedemo-web/inventory/methods/add-to-cart.effect.block.js";
import { NavCartBlock } from "../blocks/saucedemo-web/cart/nav-cart.block.js";
import { NavCheckoutInfoBlock } from "../blocks/saucedemo-web/cart/nav-checkout-info.block.js";
import { FillFirstNameBlock } from "../blocks/saucedemo-web/checkout-step-one/methods/fill-first-name.method.block.js";
import { FillLastNameBlock } from "../blocks/saucedemo-web/checkout-step-one/methods/fill-last-name.method.block.js";
import { FillPostalCodeBlock } from "../blocks/saucedemo-web/checkout-step-one/methods/fill-postal-code.method.block.js";
import { SubmitCheckoutInfoBlock } from "../blocks/saucedemo-web/checkout-step-one/methods/submit-checkout-info.method.block.js";
import { FinishOrderBlock } from "../blocks/saucedemo-web/checkout-step-two/methods/finish-order.method.block.js";
import { NavBackToProductsBlock } from "../blocks/saucedemo-web/inventory-item/nav-back-to-products.block.js";

const engine = new Engine({ headless: false, slowMo: 250 });

// Same atomic checkout chain, plus click-based nav-back-to-products
// (proves OrderComplete -> LoggedIn without a goto teleport).
export const checkoutThenBrowseAgainFlow = withTitle(
  engine.defineFlow<
    LoginPage,
    LoginPage,
    LoginPage,
    LoggedIn,
    ItemInCart,
    CartPage,
    CheckoutInfoPage,
    CheckoutInfoPage,
    CheckoutInfoPage,
    CheckoutInfoPage,
    CheckoutOverviewPage,
    OrderComplete,
    LoggedIn
  >([
    start,
    NavLoginBlock,
    FillUsernameBlock,
    FillPasswordBlock,
    SubmitLoginForFlow,
    AddToCartBlock,
    NavCartBlock,
    NavCheckoutInfoBlock,
    FillFirstNameBlock,
    FillLastNameBlock,
    FillPostalCodeBlock,
    SubmitCheckoutInfoBlock,
    FinishOrderBlock,
    NavBackToProductsBlock,
    end,
  ]),
  "Owner: Checkout, then click Back Home (click-based NavBlock demo)",
);
