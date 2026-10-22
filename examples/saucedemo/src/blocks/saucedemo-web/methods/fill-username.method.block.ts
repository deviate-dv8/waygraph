import { defineMethodBlock, checkpoint } from "waygraph";
import type { LoginPage } from "../../../states/checkout.states.js";
import { LoginCreds } from "../../../states/checkout.mem-keys.js";
import { LoginSel } from "./login.sel.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/methods/  (page URL /)
 *
 * Fills the username field only - self-loop on LoginPage, no submit, no
 * page.goto. Submit is its own Block (submit-login.method.block.ts) so the
 * graph/demo show fill vs submit as real, distinct steps instead of one
 * Block doing "input username and password and login at the same time".
 */
export const FillUsernameBlock = defineMethodBlock<LoginPage, LoginPage>({
  name: "fill-username",
  description: "Fills the username field on the login form.",
  requires: [LoginCreds.key],
  instruction: {
    async act(page, _input, mem) {
      const { username } = mem.get(LoginCreds.key);
      await page.locator(LoginSel.username).fill(username);
    },
    resolve: () => checkpoint("LoginPage"),
  },
});
