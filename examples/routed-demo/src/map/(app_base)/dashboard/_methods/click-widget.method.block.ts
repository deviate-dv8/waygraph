import type { PageHandle } from "waygraph";
import { Trait } from "waygraph";
import { DashboardSel } from "../_sel.js";

export const clickWidget = (self: PageHandle<"Dashboard">) =>
  self.method({
    name: "click-widget",
    description: "Clicks the dashboard's demo widget button.",
    async act(page) {
      await page.locator(DashboardSel.widgetBtn).click();
    },
    verify: [Trait.text(DashboardSel.widgetOut, "clicked")],
  });
