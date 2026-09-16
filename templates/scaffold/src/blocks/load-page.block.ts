import { defineBlock, checkpoint, Trait } from "waygraph";
import type { Checkpoint } from "waygraph";

export type Start = Checkpoint<"__start__">;
export type Loaded = Checkpoint<"Loaded">;

const PAGE_URL = "data:text/html,<h1>Hello Waygraph</h1>";

export const LoadPageBlock = defineBlock<Start, Loaded>({
  name: "load-page",
  instruction: {
    async act(page) {
      await page.goto(PAGE_URL);
    },
    resolve: () => checkpoint("Loaded"),
    verify: [Trait.text("h1", "Hello Waygraph")],
  },
});
