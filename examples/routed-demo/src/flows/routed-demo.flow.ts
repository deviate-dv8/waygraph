import { Engine, start, end } from "waygraph";
import { NavDashboardBlock } from "../routes/(base_app)/dashboard/nav.block.js";
import { ClickWidgetBlock } from "../routes/(base_app)/dashboard/methods/click-widget.block.js";
import { NavDocsBlock } from "../routes/(external)/docs/nav.block.js";
// Page hubs registered for auto/docs grouping (arrival-only after nav).
import "../routes/(base_app)/dashboard/page.block.js";
import "../routes/(external)/docs/page.block.js";

const engine = new Engine();

/** Smoke: dashboard -> click widget -> docs, all Blocks under the Waygraph Map folder convention. */
export const routedDemoFlow = engine.defineFlow([start, NavDashboardBlock, ClickWidgetBlock, NavDocsBlock, end]);
