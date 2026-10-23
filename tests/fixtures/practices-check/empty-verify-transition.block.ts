// Fixture — transition Block (In !== Out) with an empty verify array (bad practice).
import { defineMethodBlock, checkpoint } from "../../../dist/index.js";

export const EmptyVerifyTransitionBlock = defineMethodBlock({
  name: "empty-verify-transition-fixture",
  from: checkpoint("FixtureScreenA"),
  to: checkpoint("FixtureScreenB"),
  instruction: {
    async act(page) {
      await page.locator("#next").click();
    },
    resolve: () => checkpoint("FixtureScreenB"),
    verify: [],
  },
});
