import { engine } from "../../../config/waygraph.config.js";
import { Login } from "../../map/(main)/(app_base)/_page.block.js";
import { loginRefused } from "../../stubs/login.js";
import { SaucedemoKeys } from "../../states/checkout.mem-keys.js";

/**
 * locked_out_user attempts the login a standard user just completed and is refused: the app stays on the login page and
 * shows the error banner. Run it after another flow to see it needs a reset: `.flow(viewerBlockedFlow, { reset: true })`.
 */
export const viewerBlockedFlow = engine
  .map({
    title: "A locked-out user is refused",
    description: "locked_out_user stays on the login page with the error banner.",
    labels: ["auth"],
    sessionReset: true,
    expectedFailure:
      "locked_out_user stays on LoginPage with the error banner - this is the product working as intended.",
  })
  .gotoPage(
    Login.stubBefore((ctx) =>
      ctx.ui.title("Viewer: Blocked Login Attempt"),
    ),
  )
  .set(SaucedemoKeys.credentials, { username: "locked_out_user", password: "secret_sauce" })
  .method(Login.do.fillUsername)
  .method(Login.do.fillPassword)
  .method(
    Login.do.submitLogin.stub((ctx) => {
      if (ctx.out?.__state === "LoginPage") loginRefused(ctx);
    }),
  );
