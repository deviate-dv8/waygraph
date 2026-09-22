// waygraph-ignore: multi-input
import { defineMethodBlock, checkpoint } from "../../../dist/index.js";

type FixtureScreen = "FixtureScreen";

export const IgnoredMultiInputBlock = defineMethodBlock<FixtureScreen, FixtureScreen>({
  name: "ignored-multi-input",
  checkpoint: "FixtureScreen",
  instruction: {
    async act(page) {
      await page.locator("#a").fill("1");
      await page.locator("#b").fill("2");
    },
    resolve: () => checkpoint("FixtureScreen"),
  },
});
