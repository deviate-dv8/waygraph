import { defineAssertBlock, Trait } from "waygraph";
import { DemoSel } from "../demo-sel.js";

/**
 * Kind: Assert
 * Helper: defineAssertBlock
 * Route: demo-web/methods/
 *
 * Self-loop-only "verify what's already on the page" check - no hand-written
 * act/resolve to accidentally do a second thing. Same-URL assert after nav,
 * with stubs + fixtures + a YAP slide.
 */
export const AssertHelloBlock = defineAssertBlock({
  name: "assert-hello",
  description: "Confirms the hello heading is still visible after arrival.",
  checkpoint: "HomeVerified",
  waitForHeading: "Hello Waygraph",
  verify: [Trait.text(DemoSel.title, "Hello Waygraph"), Trait.visible(DemoSel.sub)],
  stubBefore: {
    title: { selector: DemoSel.title, label: "Heading about to check" },
  },
  stubAfter: {
    title: {
      selector: DemoSel.title,
      label: "Hello confirmed",
      detail: "Offline scaffold proof point.",
      duration: true,
    },
    sub: { selector: DemoSel.sub, label: "Subcopy", duration: 1500 },
  },
  stubOnError: {
    title: {
      selector: DemoSel.title,
      label: "Heading at failure",
      tag: "FAIL",
    },
  },
  slides: [
    {
      caption: "Scaffold covers auto + narration",
      detail: "Page hub, Effect instanceOptions, stubs, fixtures, YAP.",
      tag: "YAP",
      duration: true,
    },
  ],
});
