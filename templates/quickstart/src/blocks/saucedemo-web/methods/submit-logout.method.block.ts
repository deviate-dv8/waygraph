import { defineMethodBlock, checkpoint, Trait } from "waygraph";
import type { LoggedIn, LoginPage } from "../../../states/checkout.states.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/methods/  (page URL / after logout)
 *
 * Burger menu Logout - real cycle back to LoginPage (same Checkpoint nav-login lands on).
 */
export const SubmitLogoutBlock = defineMethodBlock<LoggedIn, LoginPage>({
  name: "submit-logout",
  description: "Opens the burger menu and logs out.",
  instruction: {
    async act(page) {
      await page.locator("#react-burger-menu-btn").click();
      await page.locator("#logout_sidebar_link").click();
    },
    resolve: () => checkpoint("LoginPage"),
    verify: [Trait.visible("#login-button")],
  },
});
