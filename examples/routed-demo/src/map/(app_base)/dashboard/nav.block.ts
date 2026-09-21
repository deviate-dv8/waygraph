import { defineNavBlock, Trait } from "waygraph";
import type { Dashboard } from "../../../states/routed-demo.states.js";
import { DashboardSel, DASHBOARD_URL } from "./dashboard.sel.js";

/**
 * Kind: Nav
 * Route: (app_base)/dashboard/
 *
 * Fixed file name under the Waygraph Map convention - every page-slug
 * folder's own navigation Block is always nav.block.ts.
 */
export const NavDashboardBlock = defineNavBlock<Dashboard>({
  name: "nav-dashboard",
  description: "Opens the dashboard page.",
  checkpoint: "Dashboard",
  url: DASHBOARD_URL,
  verify: [Trait.visible(DashboardSel.heading)],
});
