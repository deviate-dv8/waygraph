import { definePageBlock, Trait } from "waygraph";
import { InventorySel } from "../inventory.html/_sel.js";
import { LoginSel } from "../_sel.js";
import { SaucedemoKeys } from "../../../states/checkout.mem-keys.js";
import { MenuSel } from "./_sel.js";

/**
 * The burger menu every page after sign-in has, and what the header shows. A shell with no page of its own: it covers the
 * pages it names (the login page has no menu). Its links are hidden until the menu opens: a link opens it first.
 */
export const Menu = definePageBlock({
  name: "menu",
  description: "The burger menu: back to all items, or log out.",
  covers: ["InventoryPage", "ItemDetailPage", "CartPage", "CheckoutInfoPage", "CheckoutOverviewPage", "OrderComplete"],
  needs: [SaucedemoKeys.signedIn],
  opens: MenuSel.button,
  links: (self) => ({
    allItems: self.link({ to: "InventoryPage", click: MenuSel.allItems, verify: [Trait.url({ pathname: "/inventory.html" })] }),
    logout: self.link({ to: "LoginPage", click: MenuSel.logout, verify: [Trait.visible(LoginSel.loginButton)], sets: [[SaucedemoKeys.signedIn, false]] }),
  }),
  read: (ctx) => ({
    title: ctx.page.text(".title"),
    cartCount: ctx.page.fn(async (page) => {
      const badge = page.locator(InventorySel.cartBadge);
      return (await badge.count()) ? Number(await badge.first().innerText()) : 0;
    }),
  }),
  readAs: "header",
});
