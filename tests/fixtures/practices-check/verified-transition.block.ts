// Fixture — transition Block (In !== Out) with a real, non-empty verify (fine).
import { defineMethodBlock, checkpoint, Trait, type Checkpoint } from "../../../dist/index.js";

type FixtureScreenA = Checkpoint<"FixtureScreenA">;
type FixtureScreenB = Checkpoint<"FixtureScreenB">;

export const VerifiedTransitionBlock = defineMethodBlock<FixtureScreenA, FixtureScreenB>({
  name: "verified-transition-fixture",
  instruction: {
    async act(page) {
      await page.locator("#next").click();
    },
    resolve: () => checkpoint("FixtureScreenB"),
    verify: [Trait.visible("#screen-b")],
  },
});
