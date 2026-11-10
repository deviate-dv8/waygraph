import { engine } from "../../../config/waygraph.config.js";
import { Login } from "../../blocks/saucedemo-web/nav-login.block.js";
import { InventoryPage } from "../../states/checkout.states.js";
import { Inventory } from "../../blocks/saucedemo-web/inventory/inventory.page.block.js";

/** Smoke: the happy path with the Blocks' own verify lists switched off where a later step already proves the outcome. */
export const smokeFlow = engine
  .map()
  .gotoPage(Login.withVerify([]))
  .method(Login.do.fillUsername)
  .method(Login.do.fillPassword)
  .method(Login.do.submitLogin.withVerify([]), { lands: InventoryPage })
  .method(Inventory.do.addToCart.withVerify([]));
