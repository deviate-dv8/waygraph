import { defineMethodBlock, checkpoint, Trait } from "waygraph";
import { DemoSel } from "../demo-sel.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: demo-web/methods/
 *
 * Same-URL assert after nav - stubs + fixtures + YAP slide.
 */
export const AssertHelloBlock = defineMethodBlock({
  name: "assert-hello",
  description: "Confirms the hello heading is still visible after arrival.",
  instruction: {
    async act(_page) {},
    async observe(page) {
      await page.locator(DemoSel.title).first().waitFor({ state: "visible", timeout: 5_000 });
      return "ok" as const;
    },
    resolve: () => checkpoint("HomeVerified"),
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
  },
});
