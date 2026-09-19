// Fixture for tests/cli/check-inline-selector.spec.ts - the *Sel-referencing
// counterpart, proving the check stays silent when a selector is not inlined.
import { defineAssertBlock, Trait } from "../../../dist/index.js";

export const FixtureSel = {
  thing: "#not-inline",
};

export const SelReferencedBlock = defineAssertBlock({
  name: "assert-sel-referenced-fixture",
  checkpoint: "FixtureScreen",
  verify: [Trait.visible(FixtureSel.thing)],
});
