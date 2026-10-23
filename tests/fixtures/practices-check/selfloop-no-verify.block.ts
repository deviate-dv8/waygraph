// Fixture — self-loop Block (In === Out) with no verify (fine - not a transition).
import { defineMethodBlock, checkpoint } from "../../../dist/index.js";

export const SelfLoopNoVerifyBlock = defineMethodBlock({
  name: "selfloop-no-verify-fixture",
  from: checkpoint("FixtureScreenA"),
  to: checkpoint("FixtureScreenA"),
  instruction: {
    async act(page) {
      await page.locator("#field").fill("value");
    },
    resolve: () => checkpoint("FixtureScreenA"),
  },
});
