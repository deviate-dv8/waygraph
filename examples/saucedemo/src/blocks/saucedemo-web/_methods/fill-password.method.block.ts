import type { PageHandle } from "waygraph";
import { LoginSel } from "../methods/login.sel.js";
import { SaucedemoKeys } from "../../../states/checkout.mem-keys.js";

export const fillPassword = (self: PageHandle<"LoginPage">) =>
  self.method({
    name: "fill-password",
    description: "Fills the password field on the login form.",
    requires: [SaucedemoKeys.credentials],
    async act(page, _input, mem) {
      const { password } = mem.get(SaucedemoKeys.credentials);
      await page.locator(LoginSel.password).fill(password);
    },
  });
