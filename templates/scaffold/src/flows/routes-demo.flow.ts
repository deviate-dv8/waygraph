import { Engine, start, end } from "waygraph";
import { NavHomeBlock } from "../blocks/demo-web/nav-home.block.js";
import { NavDocsBlock } from "../routes/(external)/docs/nav.block.js";
// Page hub registered for auto/docs grouping (arrival-only after nav).
import "../routes/(external)/docs/page.block.js";

const engine = new Engine();

/**
 * Smoke: Home (src/blocks/, manual mode) -> Docs (src/routes/, Waygraph Map
 * convention) - proves both authoring styles coexist in one project and
 * compose through the same defineFlow/connect() mechanism unmodified.
 */
export const routesDemoFlow = engine.defineFlow([start, NavHomeBlock, NavDocsBlock, end]);
