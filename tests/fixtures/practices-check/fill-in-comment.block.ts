// Fixture — one real fill; a second one only in a comment and a string (fine: comments and strings aren't code).
import { defineMethodBlock, checkpoint } from "../../../dist/index.js";

export const FillInCommentBlock = defineMethodBlock({
  name: "fill-in-comment-fixture",
  from: checkpoint("FixtureScreen"),
  to: checkpoint("FixtureScreen"),
  description: 'not code: page.locator("#b").fill("2") or document.createElement("div")',
  instruction: {
    async act(page) {
      // was: await page.locator("#b").fill("2"); await page.locator("#go").click();
      await page.locator("#a").fill("1");
    },
    resolve: () => checkpoint("FixtureScreen"),
  },
});
