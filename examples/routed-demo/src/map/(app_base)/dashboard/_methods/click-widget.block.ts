import { defineMethodBlock, checkpoint, Trait } from "waygraph";
import type { Dashboard } from "../../../../states/routed-demo.states.js";
import { DashboardSel } from "../_sel.js";

/**
 * Kind: Method
 * Route: (app_base)/dashboard/_methods/
 *
 * Fixed folder name under the Waygraph Map convention - every page-slug
 * folder's own actions live under methods/, same as today's freeform
 * convention's own methods/ subfolder.
 */
export const ClickWidgetBlock = defineMethodBlock<Dashboard, Dashboard>({
  name: "click-widget",
  description: "Clicks the dashboard's demo widget button.",
  instruction: {
    async act(page) {
      await page.locator(DashboardSel.widgetBtn).click();
    },
    resolve: () => checkpoint("Dashboard"),
    verify: [Trait.text(DashboardSel.widgetOut, "clicked")],
  },
});
