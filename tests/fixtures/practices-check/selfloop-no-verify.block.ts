// Fixture — self-loop Block (In === Out) with no verify (fine - not a transition).
import { defineMethodBlock, checkpoint, type Checkpoint } from "../../../dist/index.js";

type FixtureScreenA = Checkpoint<"FixtureScreenA">;

export const SelfLoopNoVerifyBlock = defineMethodBlock<FixtureScreenA, FixtureScreenA>({
  name: "selfloop-no-verify-fixture",
  instruction: {
    async act(page) {
      await page.locator("#field").fill("value");
    },
    resolve: () => checkpoint("FixtureScreenA"),
  },
});
