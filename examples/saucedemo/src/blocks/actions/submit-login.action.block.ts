import { defineBlock, checkpoint, Trait } from "waygraph";
import type { LoginPage, LoginSubmitOutcome } from "../../states/checkout.states.js";
import { LoginCreds } from "../../states/checkout.mem-keys.js";

type LoginObserve = "success" | "failure";

// Fills credentials on the login page and submits - never navigates (nav-login.block.ts
// does that). Port of the old login.block.ts with the goto split out.
//
// Branches on real auth outcome: good creds -> LoggedIn; bad creds / locked user ->
// LoginPage (error banner visible). waygraph auto stays on LoginPage instead of
// pretending the run reached inventory.
export const SubmitLoginActionBlock = defineBlock<LoginPage, LoginSubmitOutcome>({
  name: "submit-login",
  description: "Logs a user in when credentials are valid; stays on LoginPage when auth fails.",
  requires: [LoginCreds.key],
  instruction: {
    async act(page, _input, mem) {
      const { username, password } = mem.get(LoginCreds.key);
      await page.locator("#user-name").fill(username);
      await page.locator("#password").fill(password);
      await page.locator("#login-button").click();
    },
    async observe(page): Promise<LoginObserve> {
      try {
        await page.waitForURL(/\/inventory\.html/, { timeout: 5_000 });
        return "success";
      } catch {
        return "failure";
      }
    },
    resolve: (observed) => checkpoint(observed === "success" ? "LoggedIn" : "LoginPage"),
    verify: (out) =>
      out.__state === "LoggedIn"
        ? [Trait.url({ pathname: "/inventory.html" })]
        : [Trait.visible('[data-test="error"]')],
  },
});
