import { definePageBlock, Trait } from "waygraph";
import type { Docs } from "../../../states/routed-demo.states.js";
import { DocsSel } from "./_sel.js";

/**
 * Kind: Page
 * Route: (external)/docs/
 * Arrival-only (nav.block.ts already landed on Docs).
 */
export const DocsPageBlock = definePageBlock<Docs>({
  name: "page-docs",
  description: "Docs hub - the routed-demo example's (external) group.",
  checkpoint: "Docs",
  verify: [Trait.visible(DocsSel.heading)],
});
