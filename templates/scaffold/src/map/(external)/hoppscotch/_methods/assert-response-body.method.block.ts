import { defineAssertBlock, type Trait } from "waygraph";
import { HoppscotchRest } from "../../../../states/demo.states.js";
import { ExpectedResponseText, ResponseBody } from "../../../../states/demo.mem-keys.js";

// Hoppscotch pretty-prints JSON, so compare with whitespace removed from both sides.
const squash = (text: string): string => text.replace(/\s+/g, "");

const bodyContainsExpected: Trait = {
  name: "response-body-contains-expected",
  async check(_page, mem) {
    return squash(mem.get(ResponseBody)).includes(squash(mem.get(ExpectedResponseText)));
  },
};

export const AssertResponseBodyBlock = defineAssertBlock({
  name: "assert-response-body",
  description: "Confirms the response body read earlier contains the mem-supplied text (whitespace ignored).",
  checkpoint: HoppscotchRest,
  requires: [ExpectedResponseText],
  verify: [bodyContainsExpected],
});
