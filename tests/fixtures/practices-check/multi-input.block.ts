// Fixture — three fills in one Method block (bad practice).
import { defineMethodBlock, checkpoint } from "../../../dist/index.js";

type FixtureScreen = "FixtureScreen";

export const MultiInputFixtureBlock = defineMethodBlock<FixtureScreen, FixtureScreen>({
  name: "multi-input-fixture",
  checkpoint: "FixtureScreen",
  instruction: {
    async act(page) {
      await page.locator("#a").fill("1");
      await page.locator("#b").fill("2");
      await page.locator("#c").fill("3");
    },
    resolve: () => checkpoint("FixtureScreen"),
  },
});
