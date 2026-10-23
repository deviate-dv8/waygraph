import { defineMethodBlock } from "waygraph";
import { LoginPage } from "../../../states/checkout.states.js";
import { LoginCreds } from "../../../states/checkout.mem-keys.js";
import { LoginSel } from "./login.sel.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/methods/  (page URL /)
 *
 * Fills the password field only - self-loop on LoginPage. See
 * fill-username.method.block.ts for why this is split from submit.
 */
export const FillPasswordBlock = defineMethodBlock({
  name: "fill-password",
  description: "Fills the password field on the login form.",
  from: LoginPage,
  to: LoginPage,
  requires: [LoginCreds.key],
  instruction: {
    async act(page, _input, mem) {
      const { password } = mem.get(LoginCreds.key);
      await page.locator(LoginSel.password).fill(password);
    },
  },
});
