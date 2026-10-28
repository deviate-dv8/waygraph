import { defineReadBlock } from "waygraph";
import { HoppscotchRest } from "./_states.js";
import { HoppscotchSel } from "./_sel.js";
import { HoppscotchRead } from "./_reads.js";

/** The last response as data: "Status: 201 • Created" and the body (empty before anything is sent). */
export const HoppscotchReadBlock = defineReadBlock({
  name: "read-hoppscotch",
  description: "The last response's status line and body.",
  from: [HoppscotchRest],
  instruction: {
    read: (ctx) => HoppscotchRead({ status: ctx.page.text(HoppscotchSel.status), body: ctx.page.text(HoppscotchSel.responseEditor) }),
  },
});
