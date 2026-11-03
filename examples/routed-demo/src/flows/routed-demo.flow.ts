import { engine } from "../../config/waygraph.config.js";
import { NavDashboardBlock } from "../map/(app_base)/dashboard/_nav.block.js";
import { ClickWidgetBlock } from "../map/(app_base)/dashboard/_methods/click-widget.block.js";
import { NavDocsBlock } from "../map/(external)/docs/_nav.block.js";


/** Smoke: dashboard -> click widget -> docs, all Blocks under the Waygraph Map folder convention. */
export const routedDemoFlow = engine.map().gotoPage(NavDashboardBlock).method(ClickWidgetBlock).gotoPage(NavDocsBlock);
