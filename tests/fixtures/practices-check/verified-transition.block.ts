// Fixture — transition Block (In !== Out) with a real, non-empty verify (fine).
import { defineMethodBlock, checkpoint, Trait } from "../../../dist/index.js";

export const VerifiedTransitionBlock = defineMethodBlock({
  name: "verified-transition-fixture",
  from: checkpoint("FixtureScreenA"),
  to: checkpoint("FixtureScreenB"),
  instruction: {
    async act(page) {
      await page.locator("#next").click();
    },
    resolve: () => checkpoint("FixtureScreenB"),
    verify: [Trait.visible("#screen-b")],
  },
});
