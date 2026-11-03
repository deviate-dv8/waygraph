// Fixture for tests/cli/check-inline-selector.spec.ts - the *Sel-referencing
// counterpart, proving the check stays silent when a selector is not inlined.
import { defineExpectBlock, Trait, checkpoint } from "../../../dist/index.js";

export const FixtureSel = {
  thing: "#not-inline",
};

export const SelReferencedBlock = defineExpectBlock({
  name: "assert-sel-referenced-fixture",
  checkpoint: checkpoint("FixtureScreen"),
  verify: [Trait.visible(FixtureSel.thing)],
});
