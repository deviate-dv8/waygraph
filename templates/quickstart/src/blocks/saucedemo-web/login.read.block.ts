import { defineReadBlock } from "waygraph";
import { LoginPage } from "../../states/checkout.states.js";
import { Login } from "../../states/checkout.reads.js";
import { LoginSel } from "./methods/login.sel.js";

/**
 * Kind: Read
 * Helper: defineReadBlock
 * Route: saucedemo-web/  (= /, the login form)
 *
 * The login page as data: the error the form shows (missing when there is none).
 */
export const LoginReadBlock = defineReadBlock({
  name: "read-login",
  description: "The error the login form shows, if any.",
  from: LoginPage,
  instruction: { read: (ctx) => Login({ error: ctx.page.text(LoginSel.errorBanner) }) },
});
