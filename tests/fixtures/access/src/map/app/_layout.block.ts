import { defineLayout } from "waygraph";
import { Admin, App, SidebarSel } from "../../app.js";
import { AdminUser } from "../../accounts/accounts.js";

export const Sidebar = defineLayout({
  name: "sidebar",
  go: {
    plan: { to: App, click: SidebarSel.plan },
    admin: { to: Admin, click: SidebarSel.admin, for: [AdminUser] },
    reports: { to: App, click: SidebarSel.reports, for: [AdminUser] },
  },
});
