// For waygraph check: flows as the planner that use what only admins are given.
import { Engine } from "waygraph";
import { Planner } from "../accounts/accounts.js";
import { NavApp } from "../map/app/nav.block.js";
import { Sidebar } from "../map/app/_layout.block.js";
import { AdminPage } from "../map/app/admin/admin.page.block.js";

const engine = new Engine();

/** Runs (the app shows Reports to everyone), though the planner isn't given it. */
export const plannerReportsFlow = engine.map({ as: Planner }).gotoPage(NavApp).gotoPage(Sidebar.go.reports);
/** The planner can't open the admin page. */
export const plannerAdminFlow = engine.map({ as: Planner, expectedFailure: "only admins open it" }).gotoPage(AdminPage);
