// Fixture — inline selector literal in a directory using the Map layout's own _sel.ts convention.
import { defineMethodBlock, checkpoint, type Checkpoint } from "../../../../dist/index.js";

type FixtureScreen = Checkpoint<"FixtureScreen">;

export const UsesInlineUnderscoreFixtureBlock = defineMethodBlock<FixtureScreen, FixtureScreen>({
  name: "uses-inline-underscore-fixture",
  instruction: {
    async act(page) {
      await page.locator("#submit").click();
    },
    resolve: () => checkpoint("FixtureScreen"),
  },
});
