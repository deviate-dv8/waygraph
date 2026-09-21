import { definePageBlock, Trait } from "waygraph";
import type { Docs } from "../../../states/demo.states.js";
import { DocsSel } from "./_sel.js";

/**
 * Kind: Page
 * Route: (app_base)/docs/
 * Arrival-only (nav.block.ts already landed on Docs).
 */
export const DocsPageBlock = definePageBlock<Docs>({
  name: "page-docs",
  description: "Docs hub - Waygraph Map convention demo.",
  checkpoint: "Docs",
  verify: [Trait.visible(DocsSel.heading)],
});
