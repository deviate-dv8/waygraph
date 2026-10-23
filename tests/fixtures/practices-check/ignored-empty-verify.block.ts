// waygraph-ignore: empty-verify
import { defineMethodBlock, checkpoint } from "../../../dist/index.js";

export const IgnoredEmptyVerifyBlock = defineMethodBlock({
  name: "ignored-empty-verify-fixture",
  from: checkpoint("FixtureScreenA"),
  to: checkpoint("FixtureScreenB"),
  instruction: {
    async act(page) {
      await page.locator("#next").click();
    },
    resolve: () => checkpoint("FixtureScreenB"),
    verify: [],
  },
});
