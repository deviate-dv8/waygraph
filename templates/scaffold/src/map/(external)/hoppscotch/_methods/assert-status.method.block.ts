import { defineAssertBlock, type Trait } from "waygraph";
import { HoppscotchRest } from "../_states.js";
import { ExpectedStatus } from "../_keys.js";
import { HoppscotchSel } from "../_sel.js";

const statusMatches: Trait = {
  name: "response-status-matches",
  async check(page, mem) {
    const text = (await page.locator(HoppscotchSel.status).first().textContent()) ?? "";
    return Number(text.match(/Status:\s*(\d+)/)?.[1]) === mem.get(ExpectedStatus);
  },
};

export const AssertStatusBlock = defineAssertBlock({
  name: "assert-status",
  description: "Confirms the response status code equals the mem-supplied one.",
  checkpoint: HoppscotchRest,
  requires: [ExpectedStatus],
  verify: [statusMatches],
});
