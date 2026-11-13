import { checkpoint, Trait } from "waygraph";
import type { PageHandle } from "waygraph";
import { LoginSel } from "../_sel.js";

/** Clicks Login. Good credentials land on the inventory; a wrong or locked-out account stays here with the error banner. */
export const submit = (self: PageHandle<"LoginPage">) =>
  self.method({
    name: "submit-login",
    description: "Submits the login form; stays on the login page when auth fails.",
    to: ["InventoryPage", "LoginPage"],
    async act(page) {
      // noWaitAfter: `lands` owns the wait. The default click navigation-wait can hang under the demo's cursor patch.
      await page.locator(LoginSel.loginButton).click({ noWaitAfter: true });
    },
    verify: (out) => (out.__state === "InventoryPage" ? [Trait.url({ pathname: "/inventory.html" })] : [Trait.visible(LoginSel.errorBanner)]),
    async lands(page) {
      // Race the inventory against the error banner: a wrong password shows it at once, so don't burn the full wait.
      const inventory = page.waitForURL(/\/inventory\.html/, { timeout: 8_000 }).then(() => "InventoryPage" as const);
      const banner = page.locator(LoginSel.errorBanner).first().waitFor({ state: "visible", timeout: 8_000 }).then(() => "LoginPage" as const);
      try {
        return checkpoint(await Promise.race([inventory, banner]));
      } catch {
        return checkpoint("LoginPage");
      }
    },
  });
