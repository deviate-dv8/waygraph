import { definePageBlock, Trait } from "waygraph";
import { Docs } from "../../../states/demo.states.js";
import { DocsSel } from "./_sel.js";

export const DocsPageBlock = definePageBlock({
  name: "page-docs",
  description: "Docs hub - Waygraph Map convention demo.",
  checkpoint: Docs,
  verify: [Trait.visible(DocsSel.heading)],
});
