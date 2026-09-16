import { defineMethodBlock, checkpoint, Trait } from "waygraph";
import type { LoginPage, LoginSubmitOutcome } from "../../../states/checkout.states.js";
import { LoginCreds } from "../../../states/checkout.mem-keys.js";

type LoginObserve = "success" | "failure";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/methods/  (page URL /)
 *
 * Fills credentials and submits - never page.goto (nav-login owns that).
 * Branches: good creds -> LoggedIn; bad/locked -> LoginPage with error banner.
 */
export const SubmitLoginActionBlock = defineMethodBlock<LoginPage, LoginSubmitOutcome>({
  name: "submit-login",
  description: "Logs a user in when credentials are valid; stays on LoginPage when auth fails.",
  requires: [LoginCreds.key],
  instruction: {
    async act(page, _input, mem) {
      const { username, password } = mem.get(LoginCreds.key);
      await page.locator("#user-name").fill(username);
      await page.locator("#password").fill(password);
      // noWaitAfter: observe owns the inventory URL wait. Default click
      // navigation-wait can hang under waygraph auto's demo cursor patch.
      await page.locator("#login-button").click({ noWaitAfter: true });
    },
    async observe(page): Promise<LoginObserve> {
      try {
        await page.waitForURL(/\/inventory\.html/, { timeout: 8_000 });
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
