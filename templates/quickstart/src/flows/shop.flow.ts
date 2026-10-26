import { engine } from "../../config/waygraph.config.js";
import "../states/checkout.mem-stubs.js";
import { AddToCartBlock } from "../blocks/saucedemo-web/inventory/methods/add-to-cart.effect.block.js";
import { NavCartBlock } from "../blocks/saucedemo-web/cart/nav-cart.block.js";
import { NavCheckoutInfoBlock } from "../blocks/saucedemo-web/cart/nav-checkout-info.block.js";
import { FillFirstNameBlock } from "../blocks/saucedemo-web/checkout-step-one/methods/fill-first-name.method.block.js";
import { FillLastNameBlock } from "../blocks/saucedemo-web/checkout-step-one/methods/fill-last-name.method.block.js";
import { FillPostalCodeBlock } from "../blocks/saucedemo-web/checkout-step-one/methods/fill-postal-code.method.block.js";
import { SubmitCheckoutInfoBlock } from "../blocks/saucedemo-web/checkout-step-one/methods/submit-checkout-info.method.block.js";
import { FinishOrderBlock } from "../blocks/saucedemo-web/checkout-step-two/methods/finish-order.method.block.js";
import { orderPlacedYap, placingOrder } from "../stubs/finish-order.js";

/** Add the selected item, check out and place the order. Starts signed in (run it after loginFlow). */
export const shopFlow = engine
  .map({ memStub: true })
  .start()
  .method(AddToCartBlock.stubBefore((ctx) => ctx.title("Shop & Checkout")))
  .gotoPage(NavCartBlock)
  .gotoPage(NavCheckoutInfoBlock)
  .method(FillFirstNameBlock)
  .method(FillLastNameBlock)
  .method(FillPostalCodeBlock)
  .method(SubmitCheckoutInfoBlock)
  .method(FinishOrderBlock.stubBefore(placingOrder).stubAfter(orderPlacedYap))
  .end();
