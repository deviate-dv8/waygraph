import { engine } from "../../config/waygraph.config.js";
import { Login } from "../blocks/saucedemo-web/nav-login.block.js";
import { InventoryPage } from "../states/checkout.states.js";

/** Standard user signs in. Credentials come from the memStub in src/states/checkout.mem-stubs.ts unless --data / mem set them. */
export const loginFlow = engine
  .map({ memStub: true })
  .gotoPage(Login.stubBefore((ctx) => ctx.ui.title("Sign In")))
  .method(Login.do.fillUsername)
  .method(Login.do.fillPassword)
  .method(Login.do.submitLogin, { lands: InventoryPage });
