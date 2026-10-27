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
import { LoginSel } from "../blocks/saucedemo-web/methods/login.sel.js";

export const checkoutFlow = engine
  .map({ memStub: true })
  .start()
  .gotoPage(NavLoginBlock, { ff: true })
  .method(
    FillUsernameBlock.stubBefore((ctx) => {
      ctx.ui.ring("username", {
        selector: LoginSel.username,
        label: "Demo user",
        detail:
          "standard_user from Mem - library block stays neutral underneath",
        tag: "AC",
        duration: true,
        focus: true,
      });
    }),
    { ff: true },
  )
  .method(
    FillPasswordBlock.stubBefore((ctx) => {
      ctx.ui.ring("password", {
        selector: LoginSel.password,
        label: "Password",
        detail: "Filled from Mem credentials.",
        duration: 1500,
        focus: true,
      });
    }),
    { ff: true },
  )
  .method(
    SubmitLoginForFlow.stubBefore((ctx) => {
      ctx.ui.ring("submit", {
        selector: LoginSel.loginButton,
        label: "Sign in",
        tag: "GATE",
        duration: true,
        fastMode: 500,
        focus: true,
        weight: "bold",
      });
    }),
    { ff: true },
  )
  .method(AddToCartBlock.stubBefore((ctx) => ctx.ui.title("Owner: Full Checkout")))
  .gotoPage(NavCartBlock)
  .gotoPage(NavCheckoutInfoBlock)
  .method(
    FillFirstNameBlock.stubBefore((ctx) => {
      ctx.ui.caption("Enter the first name on the order");
      ctx.ui.titlePos("left");
    }),
  )
  .method(
    FillLastNameBlock.stubBefore((ctx) => {
      ctx.ui.caption("Enter the last name on the order");
      ctx.ui.titlePos("center");
    }),
  )
  .method(
    FillPostalCodeBlock.stubBefore((ctx) => {
      ctx.ui.caption("Enter a postal code to calculate shipping");
      ctx.ui.titlePos("right");
    }),
  )
  .method(SubmitCheckoutInfoBlock.stubBefore((ctx) => ctx.ui.hideCaption()))
  .method(FinishOrderBlock.stubBefore(placingOrder).stubAfter(orderPlacedYap))
  .end();
