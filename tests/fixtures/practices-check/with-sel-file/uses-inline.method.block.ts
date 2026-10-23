// Fixture — inline selector literal in a directory that already has a *.sel.ts file (bad practice).
import { defineMethodBlock, checkpoint } from "../../../../dist/index.js";

export const UsesInlineFixtureBlock = defineMethodBlock({
  name: "uses-inline-fixture",
  from: checkpoint("FixtureScreen"),
  to: checkpoint("FixtureScreen"),
  instruction: {
    async act(page) {
      await page.locator("#submit").click();
    },
    resolve: () => checkpoint("FixtureScreen"),
  },
});
