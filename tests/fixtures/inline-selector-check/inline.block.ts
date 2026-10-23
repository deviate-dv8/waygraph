// Fixture for tests/cli/check-inline-selector.spec.ts - deliberately inlines a
// selector literal in `verify` to prove `waygraph check` flags it.
import { defineAssertBlock, Trait, checkpoint } from "../../../dist/index.js";

export const InlineSelectorBlock = defineAssertBlock({
  name: "assert-inline-selector-fixture",
  checkpoint: checkpoint("FixtureScreen"),
  verify: [Trait.visible("#inline-literal")],
});
