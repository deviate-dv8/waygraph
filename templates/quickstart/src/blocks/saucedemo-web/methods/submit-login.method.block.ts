import { defineMethodBlock, checkpoint, Trait, type StubCtx } from "waygraph";
import type { LoginPage, LoginSubmitOutcome } from "../../../states/checkout.states.js";
import { LoginSel } from "./login.sel.js";

type LoginObserve = "success" | "failure";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/methods/  (page URL /)
 *
 * Clicks Login only - never page.goto (nav-login Page hub owns that), never
 * fills fields (fill-username.method.block.ts / fill-password.method.block.ts
 * already did that). One Block, one action: submit.
 * Branches: good creds -> LoggedIn; bad/locked -> LoginPage with error banner.
 */
export const SubmitLoginBlock = defineMethodBlock<LoginPage, LoginSubmitOutcome>({
  name: "submit-login",
  description: "Submits the login form; stays on LoginPage when auth fails.",
  instruction: {
    async act(page) {
      // noWaitAfter: observe owns the inventory URL wait. Default click
      // navigation-wait can hang under waygraph auto's demo cursor patch.
      await page.locator(LoginSel.loginButton).click({ noWaitAfter: true });
    },
    async observe(page): Promise<LoginObserve> {
      // Race inventory nav vs error banner - locked_out / wrong password show
      // Epic sadface immediately; do not burn the full inventory timeout.
      const inventory = page.waitForURL(/\/inventory\.html/, { timeout: 8_000 }).then(() => "success" as const);
      const errorBanner = page
        .locator(LoginSel.errorBanner)
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
        : [Trait.visible(LoginSel.errorBanner)],
    stubBefore: (ctx: StubCtx) => {
      ctx.highlights({
        submit: {
          selector: LoginSel.loginButton,
          label: "Login",
          detail: "tone: warning (yellow)",
          todo: "login-submit",
          tone: "warning",
          focus: true,
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
          selector: LoginSel.errorBanner,
          label: "Login error banner",
          detail: "tone: danger (red)",
          tone: "danger",
          focus: true,
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
        detail: "tone: success (green) - ready to shop",
        tone: "success",
        focus: true,
        zoom: 1.25,
        duration: true,
      });
    },
    stubOnError: (ctx: StubCtx) => {
      ctx.title("Login failed");
      ctx.ring("error", {
        selector: LoginSel.errorBanner,
        label: "Login error banner",
        detail: "tone: danger (red)",
        tone: "danger",
        focus: true,
        duration: true,
      });
    },
  },
});
