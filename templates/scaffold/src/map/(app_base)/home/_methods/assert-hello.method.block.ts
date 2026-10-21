import { defineAssertBlock, Trait } from "waygraph";
import type { Home } from "../../../../states/demo.states.js";
import { DemoSel } from "../_sel.js";

/** Heading still shows after arrival; the slide is a YAP caption for the demo overlay. */
export const AssertHelloBlock = defineAssertBlock<Home>({
  name: "assert-hello",
  description: "Confirms the hello heading is still visible after arrival.",
  checkpoint: "Home",
  waitForHeading: "Hello Waygraph",
  verify: [Trait.text(DemoSel.title, "Hello Waygraph"), Trait.visible(DemoSel.sub)],
  slides: [
    {
      caption: "Scaffold covers auto + narration",
      detail: "Page hub, Effect instanceOptions, stubs, fixtures, YAP.",
      tag: "YAP",
      duration: true,
    },
  ],
});
