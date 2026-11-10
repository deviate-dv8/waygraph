// Fixture for tests/cli/access.spec.ts: an app on https://app.test, served in the browser. Signed in (a "who" cookie),
// every page has a sidebar: Plan for everyone, Admin for admins, and Reports, which it shows to everyone though only
// admins are given it. /admin opens for admins only.
import type { BrowserContext } from "@playwright/test";
import { checkpoint } from "waygraph";

export const App = checkpoint("App");
export const Admin = checkpoint("Admin");

export const SidebarSel = { plan: "#plan", admin: "#admin-link", reports: "#reports" };

export async function serveApp(context: BrowserContext): Promise<void> {
  await context.route("https://app.test/**", (route) => {
    const who = /who=(\w+)/.exec(route.request().headers()["cookie"] ?? "")?.[1];
    const path = new URL(route.request().url()).pathname;
    const sidebar = who ? `<a id="plan" href="/app">Plan</a>${who === "admin" ? `<a id="admin-link" href="/admin">Admin</a>` : ""}<a id="reports" href="/app">Reports</a>` : "";
    const main = path === "/admin" ? (who === "admin" ? `<h1 id="admin-title">Admin</h1>` : `<h1>Not allowed</h1>`) : `<h1 id="app-title">App</h1>`;
    return route.fulfill({ contentType: "text/html", body: `<nav>${sidebar}</nav>${main}` });
  });
}
