import { engine } from "../../config/waygraph.config.js";
import "../states/checkout.mem-stubs.js";
import { NavLoginBlock } from "../blocks/saucedemo-web/nav-login.block.js";
import { FillUsernameBlock } from "../blocks/saucedemo-web/methods/fill-username.method.block.js";
import { FillPasswordBlock } from "../blocks/saucedemo-web/methods/fill-password.method.block.js";
import { SubmitLoginForFlow } from "../blocks/saucedemo-web/methods/submit-login-for-flow.js";
import { AddToCartBlock } from "../blocks/saucedemo-web/inventory/methods/add-to-cart.effect.block.js";

/** Smoke: the happy path with the Blocks' own verify lists switched off where a later step already proves the outcome. */
export const smokeFlow = engine
  .map()
  .start()
  .gotoPage(NavLoginBlock.withVerify([]))
  .method(FillUsernameBlock)
  .method(FillPasswordBlock)
  .method(SubmitLoginForFlow.withVerify([]))
  .method(AddToCartBlock.withVerify([]))
  .end();
