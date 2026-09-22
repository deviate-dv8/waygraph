// Fixture — three fills in one Method block (bad practice).
import { defineMethodBlock, checkpoint, type Checkpoint } from "../../../dist/index.js";

type FixtureScreen = Checkpoint<"FixtureScreen">;

export const MultiInputFixtureBlock = defineMethodBlock<FixtureScreen, FixtureScreen>({
  name: "multi-input-fixture",
  instruction: {
    async act(page) {
      await page.locator("#a").fill("1");
      await page.locator("#b").fill("2");
      await page.locator("#c").fill("3");
    },
    resolve: () => checkpoint("FixtureScreen"),
  },
});
