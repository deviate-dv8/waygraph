// Fixture — transition Block (In !== Out) with no verify key at all (bad practice).
import { defineMethodBlock, checkpoint } from "../../../dist/index.js";

export const MissingVerifyTransitionBlock = defineMethodBlock({
  name: "missing-verify-transition-fixture",
  from: checkpoint("FixtureScreenA"),
  to: checkpoint("FixtureScreenB"),
  instruction: {
    async act(page) {
      await page.locator("#next").click();
    },
    resolve: () => checkpoint("FixtureScreenB"),
  },
});
