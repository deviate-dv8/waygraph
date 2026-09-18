import { defineMethodBlock, checkpoint, Trait, type StubCtx } from "waygraph";
import type { LoginPage, LoginSubmitOutcome } from "../../../states/checkout.states.js";
import { LoginCreds } from "../../../states/checkout.mem-keys.js";

type LoginObserve = "success" | "failure";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/methods/  (page URL /)
 *
 * Fills credentials and submits - never page.goto (nav-login Page hub owns that).
 * Branches: good creds -> LoggedIn; bad/locked -> LoginPage with error banner.
 * stubBefore/stubAfter drive the floating todo dock (Method fill/click advances
 * todoIndex mid-act; stubAfter marks complete / fail).
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
    // Open lifecycle: banner title, todos, Screen Studio camera zoom,
    // sequential highlight queue (appear / dwell / fade), focus + color.
    stubBefore: (ctx: StubCtx) => {
      ctx.title("Signing in · mobile");
      ctx.device("mobile");
      ctx.portrait();
      ctx.todos(
        "saucedemo",
        [
          { id: "login-user", text: "Enter username" },
          { id: "login-pass", text: "Enter password" },
          { id: "login-submit", text: "Tap Login" },
          { id: "cart-find", text: "Find the product" },
          { id: "cart-add", text: "Add to cart" },
          { id: "cart-open", text: "Open cart" },
        ],
        { title: "Device showcase", index: 0 },
      );
      ctx.zoom(1.35);
      ctx.highlights({
        username: {
          selector: "#user-name",
          label: "Username",
          todo: "login-user",
          focus: true,
          color: "#c9a6ff",
          zoom: 1.4,
        },
        password: {
          selector: "#password",
          label: "Password",
          todo: "login-pass",
          focus: true,
          color: "#c9a6ff",
          zoom: 1.4,
        },
        submit: {
          selector: "#login-button",
          label: "Login",
          todo: "login-submit",
          focus: true,
          color: "#86efac",
          zoom: 1.55,
          weight: "bold",
          gesture: "tap",
        },
      });
    },
    stubAfter: (ctx: StubCtx) => {
      if (ctx.out && ctx.out.__state === "LoginPage") {
        ctx.title("Login blocked");
        ctx.todos(
          "saucedemo",
          [
            { id: "login-user", text: "Enter username", done: true },
            { id: "login-pass", text: "Enter password", done: true },
            { id: "login-submit", text: "Click Login", done: true },
          ],
          { title: "Sign in", style: "checklist" },
        );
        ctx.ring("error", {
          selector: '[data-test="error"]',
          label: "Login error banner",
          tone: "danger",
          focus: true,
          color: "#f87171",
          duration: true,
        });
        return;
      }
      ctx.banner("Inventory · landscape");
      ctx.landscape();
      ctx.todos(
        "saucedemo",
        [
          { id: "login-user", text: "Enter username", done: true },
          { id: "login-pass", text: "Enter password", done: true },
          { id: "login-submit", text: "Tap Login", done: true },
          { id: "cart-find", text: "Find the product" },
          { id: "cart-add", text: "Add to cart" },
          { id: "cart-open", text: "Open cart" },
        ],
        { title: "Device showcase", index: 3 },
      );
      ctx.ring("shelf", {
        selector: ".inventory_list",
        label: "Product shelf",
        detail: "Ready to shop",
        focus: true,
        color: "#c9a6ff",
        zoom: 1.25,
        duration: true,
      });
    },
    stubOnError: (ctx: StubCtx) => {
      ctx.title("Login failed");
      ctx.ring("error", {
        selector: '[data-test="error"]',
        label: "Login error banner",
        tone: "danger",
        focus: true,
        color: "#f87171",
        duration: true,
      });
    },
  },
});
