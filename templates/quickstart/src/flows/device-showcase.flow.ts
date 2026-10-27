import { engine } from "../../config/waygraph.config.js";
import "../states/checkout.mem-stubs.js";
import { NavLoginBlock } from "../blocks/saucedemo-web/nav-login.block.js";
import { FillUsernameBlock } from "../blocks/saucedemo-web/methods/fill-username.method.block.js";
import { FillPasswordBlock } from "../blocks/saucedemo-web/methods/fill-password.method.block.js";
import { SubmitLoginBlock } from "../blocks/saucedemo-web/methods/submit-login.method.block.js";
import { LoggedIn } from "../states/checkout.states.js";
import { AddToCartBlock } from "../blocks/saucedemo-web/inventory/methods/add-to-cart.effect.block.js";
import { NavCartBlock } from "../blocks/saucedemo-web/cart/nav-cart.block.js";
import { deviceShowcase as d } from "../stubs/device-showcase.js";

/** Sign in on a phone, shop on a tablet, open the cart in landscape: the device and zoom narration in src/stubs/device-showcase.ts. */
export const deviceShowcaseFlow = engine
  .map({ memStub: true })
  .start()
  .gotoPage(NavLoginBlock)
  .method(
    FillUsernameBlock.stubBefore(d.username.before).stubAfter(d.username.after),
  )
  .method(
    FillPasswordBlock.stubBefore(d.password.before).stubAfter(d.password.after),
  )
  .method(
    SubmitLoginBlock.stubBefore(d.submit.before).stubAfter(d.submit.after),
    { lands: LoggedIn },
  )
  .method(
    AddToCartBlock.stubBefore(d.addToCart.before).stubAfter(d.addToCart.after),
  )
  .gotoPage(
    NavCartBlock.stubBefore(d.openCart.before).stubAfter(d.openCart.after),
  )
  .end();
