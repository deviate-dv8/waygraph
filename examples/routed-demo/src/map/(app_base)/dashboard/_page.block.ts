import { definePageBlock, Trait } from "waygraph";
import type { Dashboard } from "../../../states/routed-demo.states.js";
import { DashboardSel } from "./_sel.js";
import { ClickWidgetBlock } from "./_methods/click-widget.block.js";

/**
 * Kind: Page
 * Route: (app_base)/dashboard/
 *
 * Fixed file name under the Waygraph Map convention - every page-slug
 * folder's own arrival hub is always page.block.ts. Arrival-only
 * (nav.block.ts already landed on Dashboard).
 */
export const DashboardPageBlock = definePageBlock<Dashboard>({
  name: "page-dashboard",
  description: "Dashboard hub - the routed-demo example's (app_base) group.",
  checkpoint: "Dashboard",
  verify: [Trait.visible(DashboardSel.heading)],
  methods: {
    clickWidget: () => ClickWidgetBlock,
  },
});
