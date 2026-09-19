import { defineMethodBlock, checkpoint, type StubCtx } from "waygraph";
import type { LoginPage } from "../../../states/checkout.states.js";
import { LoginCreds } from "../../../states/checkout.mem-keys.js";
import { LoginSel } from "./login.sel.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/methods/  (page URL /)
 *
 * Fills the username field only - self-loop on LoginPage, no submit, no
 * page.goto. Submit is its own Block (submit-login.method.block.ts) so the
 * graph/demo show fill vs submit as real, distinct steps instead of one
 * Block doing "input username and password and login at the same time".
 */
export const FillUsernameBlock = defineMethodBlock<LoginPage, LoginPage>({
  name: "fill-username",
  description: "Fills the username field on the login form.",
  requires: [LoginCreds.key],
  instruction: {
    async act(page, _input, mem) {
      const { username } = mem.get(LoginCreds.key);
      await page.locator(LoginSel.username).fill(username);
    },
    resolve: () => checkpoint("LoginPage"),
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
          selector: LoginSel.username,
          label: "Username",
          todo: "login-user",
          focus: true,
          color: "#c9a6ff",
          zoom: 1.4,
        },
      });
    },
    stubAfter: (ctx: StubCtx) => {
      ctx.todos(
        "saucedemo",
        [
          { id: "login-user", text: "Enter username", done: true },
          { id: "login-pass", text: "Enter password" },
          { id: "login-submit", text: "Tap Login" },
          { id: "cart-find", text: "Find the product" },
          { id: "cart-add", text: "Add to cart" },
          { id: "cart-open", text: "Open cart" },
        ],
        { title: "Device showcase", index: 1 },
      );
    },
  },
});
