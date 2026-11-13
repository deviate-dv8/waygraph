import { engine } from "../../../config/waygraph.config.js";
import { Login } from "../../map/(shop)/_page.block.js";
import { Inventory } from "../../map/(shop)/inventory.html/_page.block.js";

/** Smoke: the happy path with the Blocks' own verify lists switched off where a later step already proves the outcome. */
export const smokeFlow = engine
  .map({ title: "Smoke", description: "Sign in and add an item: the shortest path through the shop.", labels: ["smoke"] })
  .gotoPage(Login.withVerify([]))
  .method(Login.do.fillUsername)
  .method(Login.do.fillPassword)
  .method(Login.do.submitLogin.withVerify([]), { lands: Inventory.checkpoint })
  .method(Inventory.do.addToCart.withVerify([]));
