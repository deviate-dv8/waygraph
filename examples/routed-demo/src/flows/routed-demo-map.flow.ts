import { Engine } from "waygraph";
import { NavDashboardBlock } from "../map/(app_base)/dashboard/_nav.block.js";
import { ClickWidgetBlock } from "../map/(app_base)/dashboard/_methods/click-widget.block.js";
import { NavDocsBlock } from "../map/(external)/docs/_nav.block.js";
// Page hubs registered for auto/docs grouping (arrival-only after nav).
import "../map/(app_base)/dashboard/_page.block.js";
import "../map/(external)/docs/_page.block.js";

const engine = new Engine();

const homeOrigin = process.env.WAYGRAPH_BASE_URL || "http://127.0.0.1:4277";

/**
 * Same real Blocks, same real Checkpoints, same real fixture server as
 * routed-demo.flow.ts - built with `engine.map()` instead of
 * `engine.defineFlow([start, ..., end])` to prove the fluent builder
 * against a real browser/DOM, not just the in-memory fakes
 * tests/nav/map-builder.spec.ts already covers in the main package.
 *
 * Both nav steps use `.gotoPage()`, not `.gotoExternal()` - even though
 * NavDocsBlock's file lives under the `(external)/` group. That group name
 * is organizational intent (docs.sel.ts's own `WAYGRAPH_DOCS_URL` env
 * override exists for genuinely pointing it at a different origin), but
 * this fixture server happens to serve docs.html from the exact same
 * origin as dashboard.html - the same real inconsistency this session
 * found and fixed in templates/scaffold's own (external)/docs -> (app_base)
 * rename, left as-is here since routed-demo is the one place a reader
 * benefits from seeing it: passing a real `homeOrigin` below means
 * `.gotoExternal(NavDocsBlock)` would actually THROW (same-origin, not
 * cross-origin) - `.gotoPage()` is the one that's honest about what this
 * fixture really does, regardless of the folder it's grouped under.
 */
export const routedDemoMapFlow = engine
  .map({ homeOrigin })
  .start()
  .gotoPage(NavDashboardBlock)
  .method(ClickWidgetBlock)
  .gotoPage(NavDocsBlock)
  .end();
