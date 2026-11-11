import { definePageBlock, Trait } from "waygraph";
import { NavDocsBlock } from "./_nav.block.js";
import { Docs } from "../../../states/demo.states.js";
import { DocsSel } from "./_sel.js";

export const DocsPage = definePageBlock({
  name: "page-docs",
  description: "Docs hub - Waygraph Map convention demo.",
  checkpoint: Docs,
  screenshot: true,
  nav: NavDocsBlock,
  verify: [Trait.visible(DocsSel.heading)],
  read: (ctx) => ({ heading: ctx.page.text(DocsSel.heading) })
});
