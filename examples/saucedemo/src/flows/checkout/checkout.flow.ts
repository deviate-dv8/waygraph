import { engine } from "../../../config/waygraph.config.js";
import { Login } from "../../blocks/saucedemo-web/nav-login.block.js";
import { InventoryPage } from "../../states/checkout.states.js";
import { orderPlacedYap, placingOrder } from "../../stubs/finish-order.js";
import { LoginSel } from "../../blocks/saucedemo-web/methods/login.sel.js";
import { Inventory } from "../../blocks/saucedemo-web/inventory/inventory.page.block.js";
import { Cart } from "../../blocks/saucedemo-web/cart/cart.page.block.js";
import { CheckoutInfo } from "../../blocks/saucedemo-web/checkout-step-one/checkout-info.page.block.js";
import { CheckoutOverview } from "../../blocks/saucedemo-web/checkout-step-two/checkout-overview.page.block.js";

export const checkoutFlow = engine
  .map({ title: "Check out", description: "A signed-in user buys an item and sees the order confirmed.", labels: ["checkout"], memStub: true })
  .ffStart()
  .gotoPage(Login)
  .method(
    Login.do.fillUsername.stubBefore((ctx) => {
      ctx.ui.ring("username", {
        selector: LoginSel.username,
        label: "Demo user",
        detail:
          "standard_user from Mem - library block stays neutral underneath",
        tag: "AC",
        duration: true,
        focus: true,
      });
    })
  )
  .method(
    Login.do.fillPassword.stubBefore((ctx) => {
      ctx.ui.ring("password", {
        selector: LoginSel.password,
        label: "Password",
        detail: "Filled from Mem credentials.",
        duration: 1500,
        focus: true,
      });
    })
  )
  .method(
    Login.do.submitLogin.stubBefore((ctx) => {
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
    { lands: InventoryPage },
  )
  .ffEnd()
  .method(Inventory.do.addToCart.stubBefore((ctx) => ctx.ui.title("Owner: Full Checkout")))
  .gotoPage(Cart)
  .gotoPage(CheckoutInfo)
  .method(
    CheckoutInfo.do.fillFirstName.stubBefore((ctx) => {
      ctx.ui.caption("Enter the first name on the order");
      ctx.ui.titlePos("left");
    }),
  )
  .method(
    CheckoutInfo.do.fillLastName.stubBefore((ctx) => {
      ctx.ui.caption("Enter the last name on the order");
      ctx.ui.titlePos("center");
    }),
  )
  .method(
    CheckoutInfo.do.fillPostalCode.stubBefore((ctx) => {
      ctx.ui.caption("Enter a postal code to calculate shipping");
      ctx.ui.titlePos("right");
    }),
  )
  .method(CheckoutInfo.do.submit.stubBefore((ctx) => ctx.ui.hideCaption()))
  .method(CheckoutOverview.do.finishOrder.stubBefore(placingOrder).stubAfter(orderPlacedYap));
