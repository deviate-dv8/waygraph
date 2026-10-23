// Fixture — inline selector literal in a directory using the Map layout's own _sel.ts convention.
import { defineMethodBlock, checkpoint } from "../../../../dist/index.js";

export const UsesInlineUnderscoreFixtureBlock = defineMethodBlock({
  name: "uses-inline-underscore-fixture",
  from: checkpoint("FixtureScreen"),
  to: checkpoint("FixtureScreen"),
  instruction: {
    async act(page) {
      await page.locator("#submit").click();
    },
    resolve: () => checkpoint("FixtureScreen"),
  },
});
