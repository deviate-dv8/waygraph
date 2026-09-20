import { defineNavBlock, Trait } from "waygraph";
import type { Docs } from "../../../states/demo.states.js";
import { DocsSel, DOCS_URL } from "./docs.sel.js";

/**
 * Kind: Nav
 * Route: (external)/docs/
 *
 * Demonstrates the Waygraph Map folder convention alongside this scaffold's
 * own default "manual mode" (src/blocks/) - a second, optional authoring
 * style, not a replacement. See README.md "Waygraph Map" and
 * openspec/changes/waygraph-map. `(external)` is purely organizational
 * (Next.js route-group style) - never part of the Checkpoint tag.
 */
export const NavDocsBlock = defineNavBlock<Docs>({
  name: "nav-docs",
  description: "Opens the docs page (Waygraph Map convention demo).",
  checkpoint: "Docs",
  url: DOCS_URL,
  verify: [Trait.visible(DocsSel.heading)],
});
