import { engine } from "../../config/waygraph.config.js";
import { NavDashboardBlock } from "../map/(app_base)/dashboard/_nav.block.js";
import { ClickWidgetBlock } from "../map/(app_base)/dashboard/_methods/click-widget.block.js";
import { NavDocsBlock } from "../map/(external)/docs/_nav.block.js";
// Page hubs registered for auto/docs grouping (arrival-only after nav).
import "../map/(app_base)/dashboard/_page.block.js";
import "../map/(external)/docs/_page.block.js";


/** Smoke: dashboard -> click widget -> docs, all Blocks under the Waygraph Map folder convention. */
export const routedDemoFlow = engine.map().start().gotoPage(NavDashboardBlock).method(ClickWidgetBlock).gotoPage(NavDocsBlock).end();
