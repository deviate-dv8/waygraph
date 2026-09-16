import { defineBlock, checkpoint, Trait } from "waygraph";
import type { LoggedIn, LoginPage } from "../../states/checkout.states.js";

// Opens the burger menu and clicks Logout - completes the graph's own real
// cycle back to LoginPage, the same Checkpoint nav-login.block.ts lands on.
export const SubmitLogoutBlock = defineBlock<LoggedIn, LoginPage>({
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
