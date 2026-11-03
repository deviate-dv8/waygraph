import { engine } from "../../config/waygraph.config.js";
import { Trait } from "waygraph";
import { Login } from "../blocks/saucedemo-web/nav-login.block.js";
import { loginFailed } from "../stubs/login.js";

/**
 * Forces a verify failure (locked_out_user is refused, but the verify demands the inventory page) to show `stubOnError` ringing
 * the error banner before the failure panel. Needs locked_out_user credentials: `--data` or mem.
 */
export const stubOnErrorFlow = engine
  .map({
    expectedFailure:
      "Intentional verify fail - stubOnError rings the error banner before the panel",
  })
  .gotoPage(
    Login.stubBefore((ctx) =>
      ctx.ui.title("stubOnError: locked_out fail rings"),
    ),
  )
  .method(Login.do.fillUsername)
  .method(Login.do.fillPassword)
  .method(Login.do.submitLogin.stubOnError(loginFailed))
  .withBlockVerify("submit-login", [
    Trait.url({ pathname: "/inventory.html" }),
  ]);
