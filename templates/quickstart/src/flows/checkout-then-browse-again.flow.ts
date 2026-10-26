import { engine } from "../../config/waygraph.config.js";
import "../states/checkout.mem-stubs.js";
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
import { orderPlacedYap, placingOrder } from "../stubs/finish-order.js";
import { NavBackToProductsBlock } from "../blocks/saucedemo-web/inventory-item/nav-back-to-products.block.js";

/** Full checkout, then the "Back Home" click-based Nav Block returns to the catalogue. */
export const checkoutThenBrowseAgainFlow = engine
  .map({ memStub: true })
  .start()
  .gotoPage(
    NavLoginBlock.stubBefore((ctx) =>
      ctx.title(
        "Owner: Checkout, then click Back Home (click-based NavBlock demo)",
      ),
    ),
  )
  .method(FillUsernameBlock)
  .method(FillPasswordBlock)
  .method(SubmitLoginForFlow)
  .method(AddToCartBlock)
  .gotoPage(NavCartBlock)
  .gotoPage(NavCheckoutInfoBlock)
  .method(FillFirstNameBlock)
  .method(FillLastNameBlock)
  .method(FillPostalCodeBlock)
  .method(SubmitCheckoutInfoBlock)
  .method(FinishOrderBlock.stubBefore(placingOrder).stubAfter(orderPlacedYap))
  .gotoPage(NavBackToProductsBlock)
  .end();
