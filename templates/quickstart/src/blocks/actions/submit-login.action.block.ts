import { defineBlock, checkpoint, Trait } from "waygraph";
import type { LoginPage, LoggedIn } from "../../states/checkout.states.js";
import { LoginCreds } from "../../states/checkout.mem-keys.js";

export const SubmitLoginActionBlock = defineBlock<LoginPage, LoggedIn>({
  name: "submit-login",
  description: "Logs in with credentials from mem (LoginCreds).",
  requires: [LoginCreds.key],
  instruction: {
    async act(page, _input, mem) {
      const { username, password } = mem.get(LoginCreds.key);
      await page.locator("#user-name").fill(username);
      await page.locator("#password").fill(password);
      await page.locator("#login-button").click();
    },
    resolve: () => checkpoint("LoggedIn"),
    verify: [Trait.url({ pathname: "/inventory.html" })],
  },
});
