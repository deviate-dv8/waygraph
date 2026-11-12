import type { PageHandle } from "waygraph";
import { LoginSel } from "../methods/login.sel.js";
import { SaucedemoKeys } from "../../../states/checkout.mem-keys.js";

export const fillUsername = (self: PageHandle<"LoginPage">) =>
  self.method({
    name: "fill-username",
    description: "Fills the username field on the login form.",
    requires: [SaucedemoKeys.credentials],
    async act(page, _input, mem) {
      const { username } = mem.get(SaucedemoKeys.credentials);
      await page.locator(LoginSel.username).fill(username);
    },
  });
