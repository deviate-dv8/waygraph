import { definePageBlock, Trait } from "waygraph";
import { Dashboard } from "../../../states/routed-demo.states.js";
import { DashboardSel, DASHBOARD_URL } from "./_sel.js";
/**
 * Kind: Page
 * Route: (app_base)/dashboard/
 *
 * Fixed file name under the Waygraph Map convention - every page-slug
 * folder's own arrival hub is always page.block.ts. Arrival-only
 * (nav.block.ts already landed on Dashboard).
 */
export const DashboardPageBlock = definePageBlock({
  name: "page-dashboard",
  description: "Dashboard hub - the routed-demo example's (app_base) group.",
  checkpoint: Dashboard,
  verify: [Trait.visible(DashboardSel.heading)],
  do: (self) => ({
  clickWidget: self.method({
  name: "click-widget",
  description: "Clicks the dashboard's demo widget button.",
  async act(page) {
      await page.locator(DashboardSel.widgetBtn).click();
    },
  verify: [Trait.text(DashboardSel.widgetOut, "clicked")],
  }),
  }),
  url: DASHBOARD_URL
});
