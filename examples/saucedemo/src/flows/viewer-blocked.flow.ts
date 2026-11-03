import { engine } from "../../config/waygraph.config.js";
import { Login } from "../blocks/saucedemo-web/nav-login.block.js";
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
  .gotoPage(
    Login.stubBefore((ctx) =>
      ctx.ui.title("Viewer: Blocked Login Attempt"),
    ),
  )
  .method(Login.do.fillUsername)
  .method(Login.do.fillPassword)
  .method(
    Login.do.submitLogin.stubAfter((ctx) => {
      if (ctx.out?.__state === "LoginPage") loginRefused(ctx);
    }),
  );
