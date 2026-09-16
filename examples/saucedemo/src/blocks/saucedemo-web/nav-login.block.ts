import { defineNavBlock, Trait } from "waygraph";
import type { LoginPage } from "../../states/checkout.states.js";

/**
 * Kind: Nav
 * Helper: defineNavBlock
 * Route: saucedemo-web/  (= /)
 *
 * page.goto to the login form lives here only. submit-login Action never navigates.
 */
export const NavLoginBlock = defineNavBlock<LoginPage>({
  name: "nav-login",
  description: "Goes to the Swag Labs login page.",
  checkpoint: "LoginPage",
  url: "/",
  verify: [Trait.visible("#login-button")],
});
