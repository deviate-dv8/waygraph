import { definePageBlock, Trait } from "waygraph";
import type { LoginPage } from "../../states/checkout.states.js";
import { FillUsernameBlock } from "./methods/fill-username.method.block.js";
import { FillPasswordBlock } from "./methods/fill-password.method.block.js";
import { SubmitLoginBlock } from "./methods/submit-login.method.block.js";
import { LoginSel } from "./methods/login.sel.js";

/**
 * Kind: Page
 * Helper: definePageBlock
 * Route: saucedemo-web/  (= /)
 *
 * Login screen hub. Deep-link via url; fill-username / fill-password /
 * submit-login hang off this page as three atomic Methods - fill-* are
 * self-loops (LoginPage -> LoginPage), submit-login owns the one real
 * transition (LoginPage -> LoggedIn|LoginPage). No single Block both fills
 * and submits. Name stays `nav-login` so existing flows / chain specs keep
 * working.
 */
export const NavLoginBlock = definePageBlock<LoginPage>({
  name: "nav-login",
  description: "Goes to the Swag Labs login page.",
  checkpoint: "LoginPage",
  url: "/",
  verify: [Trait.visible(LoginSel.loginButton)],
  methods: {
    fillUsername: () => FillUsernameBlock,
    fillPassword: () => FillPasswordBlock,
    submitLogin: () => SubmitLoginBlock,
  },
});
