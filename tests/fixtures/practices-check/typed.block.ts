// Fixture for tests/cli/practices-check.spec.ts — properly typed assert block.
import { defineAssertBlock, Trait, checkpoint } from "../../../dist/index.js";

export const TypedFixtureBlock = defineAssertBlock({
  name: "typed-fixture",
  checkpoint: checkpoint("FixtureScreen"),
  verify: [Trait.visible("#fixture")],
});
