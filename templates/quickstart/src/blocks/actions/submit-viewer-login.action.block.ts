import { defineBlock, checkpoint, Trait } from "waygraph";
import type { LoginPage, LoggedIn } from "../../states/checkout.states.js";
import { ViewerCreds } from "../../states/checkout.mem-keys.js";

export const SubmitViewerLoginActionBlock = defineBlock<LoginPage, LoggedIn>({
  name: "viewer-login",
  description: "Logs in as the Viewer (ViewerCreds) - locked_out_user stays blocked.",
  requires: [ViewerCreds.key],
  instruction: {
    async act(page, _input, mem) {
      const { username, password } = mem.get(ViewerCreds.key);
      await page.locator("#user-name").fill(username);
      await page.locator("#password").fill(password);
      await page.locator("#login-button").click();
    },
    resolve: () => checkpoint("LoggedIn"),
    verify: [
      {
        name: "reached-inventory-or-genuinely-blocked",
        async check(page) {
          try {
            await page.waitForURL(/\/inventory\.html/, { timeout: 5_000 });
            return true;
          } catch {
            return false;
          }
        },
      },
    ],
  },
});
