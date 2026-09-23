// Fixture — transition Block (In !== Out) with an empty verify array (bad practice).
import { defineMethodBlock, checkpoint, type Checkpoint } from "../../../dist/index.js";

type FixtureScreenA = Checkpoint<"FixtureScreenA">;
type FixtureScreenB = Checkpoint<"FixtureScreenB">;

export const EmptyVerifyTransitionBlock = defineMethodBlock<FixtureScreenA, FixtureScreenB>({
  name: "empty-verify-transition-fixture",
  instruction: {
    async act(page) {
      await page.locator("#next").click();
    },
    resolve: () => checkpoint("FixtureScreenB"),
    verify: [],
  },
});
