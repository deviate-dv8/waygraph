import { Engine, defineMethodBlock, defineNavBlock, checkpoint, key } from "waygraph";
import type { Checkpoint } from "waygraph";

type Home = Checkpoint<"Home">;
const NeedsKey = key<string>("fixture.needs-a-key");

const Open = defineNavBlock<Home>({ name: "open", checkpoint: "Home", url: "about:blank" });
const Use = defineMethodBlock<Home, Home>({
  name: "use",
  requires: [NeedsKey],
  instruction: { async act() {}, resolve: () => checkpoint("Home") },
});

/** Opts into memStub, but nothing registers a generator for its key. */
export const needsKeyFlow = new Engine().map({ memStub: true }).start().gotoPage(Open).method(Use).end();
