import { defineMethodBlock, checkpoint, type StubCtx } from "waygraph";
import type { LoginPage } from "../../../states/checkout.states.js";
import { LoginCreds } from "../../../states/checkout.mem-keys.js";
import { LoginSel } from "./login.sel.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/methods/  (page URL /)
 *
 * Fills the password field only - self-loop on LoginPage. See
 * fill-username.method.block.ts for why this is split from submit.
 */
export const FillPasswordBlock = defineMethodBlock<LoginPage, LoginPage>({
  name: "fill-password",
  description: "Fills the password field on the login form.",
  requires: [LoginCreds.key],
  instruction: {
    async act(page, _input, mem) {
      const { password } = mem.get(LoginCreds.key);
      await page.locator(LoginSel.password).fill(password);
    },
    resolve: () => checkpoint("LoginPage"),
    stubBefore: (ctx: StubCtx) => {
      ctx.highlights({
        password: {
          selector: LoginSel.password,
          label: "Password",
          detail: "tone: planned (purple)",
          todo: "login-pass",
          tone: "planned",
          focus: true,
          zoom: 1.4,
        },
      });
    },
    stubAfter: (ctx: StubCtx) => {
      ctx.todos(
        "saucedemo",
        [
          { id: "login-user", text: "Enter username", done: true },
          { id: "login-pass", text: "Enter password", done: true },
          { id: "login-submit", text: "Tap Login" },
          { id: "cart-find", text: "Find the product" },
          { id: "cart-add", text: "Add to cart" },
          { id: "cart-open", text: "Open cart" },
        ],
        { title: "Device showcase", index: 2 },
      );
    },
  },
});
