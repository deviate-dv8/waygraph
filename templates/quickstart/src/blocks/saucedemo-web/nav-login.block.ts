import { definePageBlock, Trait } from "waygraph";
import { LoginPage } from "../../states/checkout.states.js";
import { SubmitLoginBlock } from "./methods/submit-login.method.block.js";
import { LoginSel } from "./methods/login.sel.js";
import { SaucedemoKeys } from "../../states/checkout.mem-keys.js";

/**
 * Kind: Page
 * Helper: definePageBlock
 * Route: saucedemo-web/  (= /)
 *
 * Login screen hub. Deep-link via url; fill-username / fill-password /
 * submit-login hang off this page as three atomic Methods - fill-* are
 * self-loops (LoginPage -> LoginPage), submit-login owns the one real
 * transition (LoginPage -> InventoryPage|LoginPage). No single Block both fills
 * and submits. Name stays `nav-login` so existing flows / chain specs keep
 * working.
 */
export const Login = definePageBlock({
  name: "nav-login",
  description: "Goes to the Swag Labs login page.",
  checkpoint: LoginPage,
  screenshot: true,
  url: "/",
  verify: [Trait.visible(LoginSel.loginButton)],
  read: (ctx) => ({ error: ctx.page.text(LoginSel.errorBanner) }),
  readAs: "login",
  do: (self) => ({
  fillUsername: self.method({
  name: "fill-username",
  description: "Fills the username field on the login form.",
  requires: [SaucedemoKeys.credentials],
  async act(page, _input, mem) {
      const { username } = mem.get(SaucedemoKeys.credentials);
      await page.locator(LoginSel.username).fill(username);
    },
  }),
  fillPassword: self.method({
  name: "fill-password",
  description: "Fills the password field on the login form.",
  requires: [SaucedemoKeys.credentials],
  async act(page, _input, mem) {
      const { password } = mem.get(SaucedemoKeys.credentials);
      await page.locator(LoginSel.password).fill(password);
    },
  }),
  submitLogin: SubmitLoginBlock,
  })
});
