import { defineMethodBlock, checkpoint, Trait } from "waygraph";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: demo-web/methods/
 *
 * Same-URL assert after nav - shows stubBefore / stubAfter / stubOnError shape.
 */
export const AssertHelloBlock = defineMethodBlock({
  name: "assert-hello",
  description: "Confirms the hello heading is still visible after arrival.",
  instruction: {
    async act(_page) {
      // No DOM mutation - observe/verify own the proof.
    },
    async observe(page) {
      await page.locator("h1").first().waitFor({ state: "visible", timeout: 5_000 });
      return "ok" as const;
    },
    resolve: () => checkpoint("HomeVerified"),
    verify: [Trait.text("h1", "Hello Waygraph"), Trait.visible("#sub")],
    stubBefore: {
      title: { selector: "h1", label: "Heading about to check" },
    },
    stubAfter: {
      title: {
        selector: "h1",
        label: "Hello confirmed",
        detail: "Offline scaffold proof point.",
        duration: true,
      },
      sub: { selector: "#sub", label: "Subcopy", duration: 1500 },
    },
    stubOnError: {
      title: {
        selector: "h1",
        label: "Heading at failure",
        tag: "FAIL",
      },
    },
    slides: [
      {
        caption: "Scaffold is route-shaped",
        detail: "demo-web/ = synthetic /. Grow folders per real page.tsx.",
        tag: "YAP",
        duration: true,
      },
    ],
  },
});
