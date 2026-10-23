import { defineNavBlock, Trait } from "waygraph";
import { Docs } from "../../../states/demo.states.js";
import { DocsSel, DOCS_URL } from "./_sel.js";

export const NavDocsBlock = defineNavBlock({
  name: "nav-docs",
  description: "Opens the docs page (Waygraph Map convention demo).",
  checkpoint: Docs,
  url: DOCS_URL,
  verify: [Trait.visible(DocsSel.heading)],
});
