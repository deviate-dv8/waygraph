// Fixture — regex text-match pseudo-class where a plain selector would do (bad practice).
import { defineMethodBlock, checkpoint } from "../../../dist/index.js";

export const OvercomplexSelectorFixtureBlock = defineMethodBlock({
  name: "overcomplex-selector-fixture",
  from: checkpoint("FixtureScreen"),
  to: checkpoint("FixtureScreen"),
  instruction: {
    async act(page) {
      await page.locator(':has-text(/^Submit$/)').click();
    },
    resolve: () => checkpoint("FixtureScreen"),
  },
});
