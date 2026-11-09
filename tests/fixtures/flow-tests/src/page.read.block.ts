import { checkpoint, defineReadBlock } from "waygraph";
import { PageShows } from "./page.reads.js";

// Not imported by any flow: `waygraph test` loads it, as a run does.
export const PageReadBlock = defineReadBlock({
  name: "read-page",
  from: [checkpoint("Page")],
  instruction: { read: (ctx) => PageShows({ title: ctx.page.text("h1") }) },
});
