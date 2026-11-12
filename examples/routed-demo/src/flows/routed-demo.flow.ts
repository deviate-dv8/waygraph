import { engine } from "../../config/waygraph.config.js";
import { DashboardPageBlock } from "../map/(app_base)/dashboard/_page.block.js";
import { DocsPageBlock } from "../map/(external)/docs/_page.block.js";

/** Smoke: dashboard -> click widget -> docs, all Blocks under the Waygraph Map folder convention. */
export const routedDemoFlow = engine.map().gotoPage(DashboardPageBlock).method(DashboardPageBlock.do.clickWidget).gotoPage(DocsPageBlock);
