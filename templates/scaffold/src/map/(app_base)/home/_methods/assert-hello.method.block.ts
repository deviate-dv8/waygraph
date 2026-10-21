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
})
  .stubBefore((ctx) => {
    ctx.ring("title", { selector: DemoSel.title, label: "Heading about to check" });
  })
  .stubAfter((ctx) => {
    ctx.ring("title", {
      selector: DemoSel.title,
      label: "Hello confirmed",
      detail: "Offline scaffold proof point.",
      duration: true,
    });
    ctx.ring("sub", { selector: DemoSel.sub, label: "Subcopy", duration: 1500 });
  })
  .stubOnError((ctx) => {
    ctx.ring("title", { selector: DemoSel.title, label: "Heading at failure", tag: "FAIL" });
  });
