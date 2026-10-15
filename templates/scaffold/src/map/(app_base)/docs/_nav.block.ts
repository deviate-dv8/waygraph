import { defineNavBlock, Trait } from "waygraph";
import type { Docs } from "../../../states/demo.states.js";
import { DocsSel, DOCS_URL } from "./_sel.js";

/**
 * Kind: Nav
 * Route: (app_base)/docs/
 *
 * Same shape as home/ (its own file:// page, no server) - lives
 * under (app_base), not (external). See docs/REFERENCE.md "Waygraph Map" and
 * openspec/changes/waygraph-map. `(app_base)` is purely organizational
 * (Next.js route-group style) - never part of the Checkpoint tag.
 */
export const NavDocsBlock = defineNavBlock<Docs>({
  name: "nav-docs",
  description: "Opens the docs page (Waygraph Map convention demo).",
  checkpoint: "Docs",
  url: DOCS_URL,
  verify: [Trait.visible(DocsSel.heading)],
});
