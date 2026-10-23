import { defineAssertBlock, type Trait } from "waygraph";
import { HoppscotchRest } from "../_states.js";
import { ExpectedResponseHeader, ResponseHeaders } from "../_keys.js";

const headerMatches: Trait = {
  name: "response-header-matches",
  async check(_page, mem) {
    const { name, value } = mem.get(ExpectedResponseHeader.key);
    return mem.get(ResponseHeaders)[name.toLowerCase()] === value;
  },
};

export const AssertResponseHeaderBlock = defineAssertBlock({
  name: "assert-response-header",
  description: "Confirms a response header read earlier has the mem-supplied value.",
  checkpoint: HoppscotchRest,
  requires: [ExpectedResponseHeader.key],
  verify: [headerMatches],
});
