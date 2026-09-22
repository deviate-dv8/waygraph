// Fixture — fill + click in one Method block (bad practice).
import { defineMethodBlock, checkpoint, type Checkpoint } from "../../../dist/index.js";

type FixtureScreen = Checkpoint<"FixtureScreen">;

export const CombinedActionFixtureBlock = defineMethodBlock<FixtureScreen, FixtureScreen>({
  name: "combined-action-fixture",
  instruction: {
    async act(page) {
      await page.locator("#user-name").fill("user");
      await page.locator("#login-button").click();
    },
    resolve: () => checkpoint("FixtureScreen"),
  },
});
