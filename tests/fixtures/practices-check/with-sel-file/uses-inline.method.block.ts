// Fixture — inline selector literal in a directory that already has a *.sel.ts file (bad practice).
import { defineMethodBlock, checkpoint, type Checkpoint } from "../../../../dist/index.js";

type FixtureScreen = Checkpoint<"FixtureScreen">;

export const UsesInlineFixtureBlock = defineMethodBlock<FixtureScreen, FixtureScreen>({
  name: "uses-inline-fixture",
  instruction: {
    async act(page) {
      await page.locator("#submit").click();
    },
    resolve: () => checkpoint("FixtureScreen"),
  },
});
