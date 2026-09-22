// Fixture for tests/cli/practices-check.spec.ts — properly typed assert block.
import { defineAssertBlock, Trait } from "../../../dist/index.js";

type FixtureScreen = "FixtureScreen";

export const TypedFixtureBlock = defineAssertBlock<FixtureScreen>({
  name: "typed-fixture",
  checkpoint: "FixtureScreen",
  verify: [Trait.visible("#fixture")],
});
