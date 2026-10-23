import { defineMethodBlock, Trait } from "waygraph";
import { Dashboard } from "../../../../states/routed-demo.states.js";
import { DashboardSel } from "../_sel.js";

/**
 * Kind: Method
 * Route: (app_base)/dashboard/_methods/
 *
 * Fixed folder name under the Waygraph Map convention - every page-slug
 * folder's own actions live under methods/, same as today's freeform
 * convention's own methods/ subfolder.
 */
export const ClickWidgetBlock = defineMethodBlock({
  name: "click-widget",
  description: "Clicks the dashboard's demo widget button.",
  from: Dashboard,
  to: Dashboard,
  instruction: {
    async act(page) {
      await page.locator(DashboardSel.widgetBtn).click();
    },
    verify: [Trait.text(DashboardSel.widgetOut, "clicked")],
  },
});
