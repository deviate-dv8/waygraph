import { defineAssertBlock, Trait } from "waygraph";
import { Home } from "../../../../states/demo.states.js";
import { DemoSel } from "../_sel.js";

/** Heading still shows after arrival. */
export const AssertHelloBlock = defineAssertBlock({
  name: "assert-hello",
  description: "Confirms the hello heading is still visible after arrival.",
  checkpoint: Home,
  waitForHeading: "Hello Waygraph",
  verify: [Trait.text(DemoSel.title, "Hello Waygraph"), Trait.visible(DemoSel.sub)],
});
