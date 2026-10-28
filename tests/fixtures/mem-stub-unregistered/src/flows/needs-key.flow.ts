import { Engine, defineMethodBlock, defineNavBlock, checkpoint, keys } from "waygraph";

const { needsAKey: NeedsKey } = keys("fixture")<{ needsAKey: string }>();

const Open = defineNavBlock({ name: "open", checkpoint: checkpoint("Home"), url: "about:blank" });
const Use = defineMethodBlock({
  name: "use",
  from: checkpoint("Home"),
  to: checkpoint("Home"),
  requires: [NeedsKey],
  instruction: { async act() { }, resolve: () => checkpoint("Home") },
});

/** Opts into memStub, but nothing registers a generator for its key. */
export const needsKeyFlow = new Engine().map({ memStub: true }).start().gotoPage(Open).method(Use).end();
