import { defineNavBlock, Trait } from "waygraph";
import type { Docs } from "../../../states/routed-demo.states.js";
import { DocsSel, DOCS_URL } from "./_sel.js";

/**
 * Kind: Nav
 * Route: (external)/docs/
 *
 * `(external)` is a purely organizational group folder (Next.js route-group
 * style, parens never affect the Checkpoint tag) - separates cross-origin/
 * external tooling from the app's own `(app_base)` pages, matching the
 * already-established `*-external/` namespacing precedent from
 * waygraph-mail-adapters.
 */
export const NavDocsBlock = defineNavBlock<Docs>({
  name: "nav-docs",
  description: "Opens the docs page.",
  checkpoint: "Docs",
  url: DOCS_URL,
  verify: [Trait.visible(DocsSel.heading)],
});
