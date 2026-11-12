import { definePageBlock, Trait } from "waygraph";
import { Docs } from "../../../states/demo.states.js";
import { DocsSel, DOCS_URL } from "./_sel.js";

export const DocsPage = definePageBlock({
  name: "page-docs",
  description: "Docs hub - Waygraph Map convention demo.",
  checkpoint: Docs,
  screenshot: true,
  url: DOCS_URL,
  verify: [Trait.visible(DocsSel.heading)],
  read: (ctx) => ({ heading: ctx.page.text(DocsSel.heading) })
});
