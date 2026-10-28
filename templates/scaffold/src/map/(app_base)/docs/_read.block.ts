import { defineReadBlock } from "waygraph";
import { Docs } from "../../../states/demo.states.js";
import { DocsSel } from "./_sel.js";
import { DocsRead } from "./_reads.js";

/** The docs page as data. */
export const DocsReadBlock = defineReadBlock({
  name: "read-docs",
  description: "The docs page's heading.",
  from: [Docs],
  instruction: { read: (ctx) => DocsRead({ heading: ctx.page.text(DocsSel.heading) }) },
});
