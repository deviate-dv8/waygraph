import { engine } from "../../config/waygraph.config.js";
import "../states/checkout.mem-stubs.js";
import { NavLoginBlock } from "../blocks/saucedemo-web/nav-login.block.js";
import { FillUsernameBlock } from "../blocks/saucedemo-web/methods/fill-username.method.block.js";
import { FillPasswordBlock } from "../blocks/saucedemo-web/methods/fill-password.method.block.js";
import { SubmitLoginBlock } from "../blocks/saucedemo-web/methods/submit-login.method.block.js";
import { loginRefused } from "../stubs/login.js";

/**
 * locked_out_user attempts the login a standard user just completed and is refused: the app stays on the login page and
 * shows the error banner. Run it after another flow to see it needs a reset: `.flow(viewerBlockedFlow, { reset: true })`.
 */
export const viewerBlockedFlow = engine
  .map({
    sessionReset: true,
    expectedFailure:
      "locked_out_user stays on LoginPage with the error banner - this is the product working as intended.",
  })
  .start()
  .gotoPage(
    NavLoginBlock.stubBefore((ctx) =>
      ctx.ui.title("Viewer: Blocked Login Attempt"),
    ),
  )
  .method(FillUsernameBlock)
  .method(FillPasswordBlock)
  .method(
    SubmitLoginBlock.stubAfter((ctx) => {
      if (ctx.out?.__state === "LoginPage") loginRefused(ctx);
    }),
  )
  .end();
