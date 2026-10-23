// waygraph-ignore: multi-input
import { defineMethodBlock, checkpoint } from "../../../dist/index.js";

export const IgnoredMultiInputBlock = defineMethodBlock({
  name: "ignored-multi-input",
  from: checkpoint("FixtureScreen"),
  to: checkpoint("FixtureScreen"),
  instruction: {
    async act(page) {
      await page.locator("#a").fill("1");
      await page.locator("#b").fill("2");
    },
    resolve: () => checkpoint("FixtureScreen"),
  },
});
