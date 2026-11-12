import { definePageBlock, Trait } from "waygraph";
import { InventoryPage, LoginPage } from "../../states/checkout.states.js";
import { LoginSel } from "./methods/login.sel.js";
import { MenuSel } from "./menu.sel.js";
import { InventorySel } from "./inventory/methods/inventory-items.js";

/**
 * The burger menu on every page after sign-in, and what the header shows. A shell with no page of its own: it covers the
 * pages it names (the login page shares this folder but has no menu). Its links are hidden until the menu opens: a link
 * opens it first.
 */
export const Menu = definePageBlock({
  name: "menu",
  description: "The burger menu: back to all items, or log out.",
  covers: ["InventoryPage", "ItemDetailPage", "CartPage", "CheckoutInfoPage", "CheckoutOverviewPage", "OrderComplete"],
  opens: MenuSel.button,
  links: (self) => ({
    allItems: self.link({ to: InventoryPage, click: MenuSel.allItems, verify: [Trait.url({ pathname: "/inventory.html" })] }),
    logout: self.link({ to: LoginPage, click: MenuSel.logout, verify: [Trait.visible(LoginSel.loginButton)] }),
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
