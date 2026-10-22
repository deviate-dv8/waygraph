import { engine } from "../../config/waygraph.config.js";
import "../states/checkout.mem-stubs.js";
import { Trait } from "waygraph";
import { NavLoginBlock } from "../blocks/saucedemo-web/nav-login.block.js";
import { FillUsernameBlock } from "../blocks/saucedemo-web/methods/fill-username.method.block.js";
import { FillPasswordBlock } from "../blocks/saucedemo-web/methods/fill-password.method.block.js";
import { SubmitLoginBlock } from "../blocks/saucedemo-web/methods/submit-login.method.block.js";
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
  .start()
  .gotoPage(
    NavLoginBlock.stubBefore((ctx) =>
      ctx.title("stubOnError: locked_out fail rings"),
    ),
  )
  .method(FillUsernameBlock)
  .method(FillPasswordBlock)
  .method(SubmitLoginBlock.stubOnError(loginFailed))
  .end()
  .withBlockVerify("submit-login", [
    Trait.url({ pathname: "/inventory.html" }),
  ]);
