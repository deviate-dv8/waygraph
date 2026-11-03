// Fixture for tests/cli/practices-check.spec.ts — properly typed assert block.
import { defineExpectBlock, Trait, checkpoint } from "../../../dist/index.js";

export const TypedFixtureBlock = defineExpectBlock({
  name: "typed-fixture",
  checkpoint: checkpoint("FixtureScreen"),
  verify: [Trait.visible("#fixture")],
});
