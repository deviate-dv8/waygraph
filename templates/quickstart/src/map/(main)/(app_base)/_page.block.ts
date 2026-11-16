import { definePageBlock, Trait } from "waygraph";
import { LoginSel } from "./_sel.js";
import { fillUsername } from "./_methods/fill-username.method.block.js";
import { fillPassword } from "./_methods/fill-password.method.block.js";
import { submit } from "./_methods/submit.method.block.js";

/** The login screen: the first page of every flow, and where logging out ends. */
export const Login = definePageBlock({
  name: "page-login",
  description: "The Swag Labs login page.",
  checkpoint: "LoginPage",
  screenshot: true,
  url: "/",
  verify: [Trait.visible(LoginSel.loginButton)],
  read: (ctx) => ({ error: ctx.page.text(LoginSel.errorBanner) }),
  readAs: "login",
  do: (self) => ({
    fillUsername: fillUsername(self),
    fillPassword: fillPassword(self),
    submitLogin: submit(self),
  }),
});
