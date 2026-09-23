// Fixture — transition Block (In !== Out) with no verify key at all (bad practice).
import { defineMethodBlock, checkpoint, type Checkpoint } from "../../../dist/index.js";

type FixtureScreenA = Checkpoint<"FixtureScreenA">;
type FixtureScreenB = Checkpoint<"FixtureScreenB">;

export const MissingVerifyTransitionBlock = defineMethodBlock<FixtureScreenA, FixtureScreenB>({
  name: "missing-verify-transition-fixture",
  instruction: {
    async act(page) {
      await page.locator("#next").click();
    },
    resolve: () => checkpoint("FixtureScreenB"),
  },
});
