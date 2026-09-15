import { defineBlock, checkpoint, Trait } from "waygraph";
import type { LoginPage, LoggedIn } from "../../states/quickstart.states.js";

// Credentials hardcoded on purpose, to keep this first look at waygraph
// self-contained - no setup step, nothing to type before you can watch it
// run. A real project reaches for a MemKey/keyGroup instead (see waygraph's
// own README, or projects_waygraph/saucedemo in this same workspace) so
// different scenarios (an Owner vs. a blocked Viewer, say) can hand a Flow
// different credentials at run time without editing the Block itself.
export const SubmitLoginActionBlock = defineBlock<LoginPage, LoggedIn>({
  name: "submit-login",
  description: "Logs a standard user into Swag Labs and confirms the inventory page loads.",
  instruction: {
    async act(page) {
      await page.locator("#user-name").fill("standard_user");
      await page.locator("#password").fill("secret_sauce");
      await page.locator("#login-button").click();
    },
    resolve: () => checkpoint("LoggedIn"),
    verify: [Trait.url({ pathname: "/inventory.html" })],
  },
});
