import { Engine, withTitle } from "waygraph";
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
import { LoginSel } from "../blocks/saucedemo-web/methods/login.sel.js";

const engine = new Engine({ headless: false, slowMo: 250 });

/**
 * Owner checkout via map() + .ffStart/.ffEnd (no separate FfOwnerAuthBlock,
 * no HighlightFixtureMap). Auth collapses to one blitz step; post-login
 * blocks keep their own ctx stubBefore/stubAfter. Call-site decorate example
 * on fill-username when --ff-expand shows inners again.
 */
export const checkoutFlow = withTitle(
  engine
    .map()
    .start()
    .ffStart("ff-owner-auth")
    .gotoPage(NavLoginBlock)
    .method(
      FillUsernameBlock.stubBefore((ctx) => {
        ctx.ring("username", {
          selector: LoginSel.username,
          label: "Demo user",
          detail: "standard_user from Mem - library block stays neutral underneath",
          tag: "AC",
          duration: true,
          focus: true,
        });
      }),
    )
    .method(
      FillPasswordBlock.stubBefore((ctx) => {
        ctx.ring("password", {
          selector: LoginSel.password,
          label: "Password",
          detail: "Filled from Mem credentials.",
          duration: 1500,
          focus: true,
        });
      }),
    )
    .method(
      SubmitLoginForFlow.stubBefore((ctx) => {
        ctx.ring("submit", {
          selector: LoginSel.loginButton,
          label: "Sign in",
          tag: "GATE",
          duration: true,
          fastMode: 500,
          focus: true,
          weight: "bold",
        });
      }),
    )
    .ffEnd()
    .method(AddToCartBlock)
    .gotoPage(NavCartBlock)
    .gotoPage(NavCheckoutInfoBlock)
    .method(FillFirstNameBlock)
    .method(FillLastNameBlock)
    .method(FillPostalCodeBlock)
    .method(SubmitCheckoutInfoBlock)
    .method(FinishOrderBlock)
    .end(),
  "Owner: Full Checkout",
);
