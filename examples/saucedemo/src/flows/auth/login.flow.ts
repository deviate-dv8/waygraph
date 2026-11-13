import { engine } from "../../../config/waygraph.config.js";
import { Inventory } from "../../map/(shop)/inventory.html/_page.block.js";
import { Login } from "../../map/(shop)/_page.block.js";

/** Standard user signs in. Credentials come from the memStub in src/states/checkout.mem-stubs.ts unless --data / mem set them. */
export const loginFlow = engine
  .map({ title: "Sign in", description: "A standard user signs in and lands on the inventory.", labels: ["auth", "smoke"], memStub: true })
  .gotoPage(Login.stubBefore((ctx) => ctx.ui.title("Sign In")))
  .method(Login.do.fillUsername)
  .method(Login.do.fillPassword)
  .method(Login.do.submitLogin, { lands: Inventory.checkpoint });
