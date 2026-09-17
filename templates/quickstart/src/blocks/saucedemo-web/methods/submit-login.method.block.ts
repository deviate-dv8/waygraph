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
      // Race inventory nav vs error banner - locked_out / wrong password show
      // Epic sadface immediately; do not burn the full inventory timeout.
      const inventory = page.waitForURL(/\/inventory\.html/, { timeout: 8_000 }).then(() => "success" as const);
      const errorBanner = page
        .locator('[data-test="error"]')
        .first()
        .waitFor({ state: "visible", timeout: 8_000 })
        .then(() => "failure" as const);
      try {
        return await Promise.race([inventory, errorBanner]);
      } catch {
        return "failure";
      }
    },
    resolve: (observed) => checkpoint(observed === "success" ? "LoggedIn" : "LoginPage"),
    verify: (out) =>
      out.__state === "LoggedIn"
        ? [Trait.url({ pathname: "/inventory.html" })]
        : [Trait.visible('[data-test="error"]')],
    stubBefore: (ctx) => {
      ctx.todos(["Enter username", "Enter password", "Click Login"]);
      ctx.todoIndex(0);
      ctx.highlights({
        username: { selector: "#user-name", label: "Username" },
        password: { selector: "#password", label: "Password" },
        submit: { selector: "#login-button", label: "Login" },
      });
    },
    stubAfter: (ctx) => {
      ctx.todos(["Enter username", "Enter password", "Click Login"]);
      ctx.todoIndex(2);
    },
    stubOnError: (ctx) => {
      ctx.ring("error", {
        selector: '[data-test="error"]',
        label: "Login error banner",
        duration: true,
      });
    },
  },
});
