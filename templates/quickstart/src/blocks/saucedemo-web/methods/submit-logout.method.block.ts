import { defineMethodBlock, Trait } from "waygraph";
import { LoggedIn, LoginPage } from "../../../states/checkout.states.js";
import { LoginSel } from "./login.sel.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/methods/  (page URL / after logout)
 *
 * Burger menu Logout - real cycle back to LoginPage (same Checkpoint nav-login lands on).
 */
export const SubmitLogoutBlock = defineMethodBlock({
  name: "submit-logout",
  description: "Opens the burger menu and logs out.",
  from: LoggedIn,
  to: LoginPage,
  instruction: {
    async act(page) {
      await page.locator(LoginSel.burgerMenuButton).click();
      await page.locator(LoginSel.logoutLink).click();
    },
    verify: [Trait.visible(LoginSel.loginButton)],
  },
});
