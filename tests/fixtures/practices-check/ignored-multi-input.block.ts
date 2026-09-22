// waygraph-ignore: multi-input
import { defineMethodBlock, checkpoint, type Checkpoint } from "../../../dist/index.js";

type FixtureScreen = Checkpoint<"FixtureScreen">;

export const IgnoredMultiInputBlock = defineMethodBlock<FixtureScreen, FixtureScreen>({
  name: "ignored-multi-input",
  instruction: {
    async act(page) {
      await page.locator("#a").fill("1");
      await page.locator("#b").fill("2");
    },
    resolve: () => checkpoint("FixtureScreen"),
  },
});
