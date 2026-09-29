// Fixture — regex text-match pseudo-class where a plain selector would do (bad practice).
import { defineMethodBlock, checkpoint, type Checkpoint } from "../../../dist/index.js";

type FixtureScreen = Checkpoint<"FixtureScreen">;

export const OvercomplexSelectorFixtureBlock = defineMethodBlock<FixtureScreen, FixtureScreen>({
  name: "overcomplex-selector-fixture",
  instruction: {
    async act(page) {
      await page.locator(':has-text(/^Submit$/)').click();
    },
    resolve: () => checkpoint("FixtureScreen"),
  },
});
