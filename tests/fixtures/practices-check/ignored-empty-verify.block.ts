// waygraph-ignore: empty-verify
import { defineMethodBlock, checkpoint, type Checkpoint } from "../../../dist/index.js";

type FixtureScreenA = Checkpoint<"FixtureScreenA">;
type FixtureScreenB = Checkpoint<"FixtureScreenB">;

export const IgnoredEmptyVerifyBlock = defineMethodBlock<FixtureScreenA, FixtureScreenB>({
  name: "ignored-empty-verify-fixture",
  instruction: {
    async act(page) {
      await page.locator("#next").click();
    },
    resolve: () => checkpoint("FixtureScreenB"),
    verify: [],
  },
});
