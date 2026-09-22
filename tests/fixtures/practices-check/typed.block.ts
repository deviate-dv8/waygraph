// Fixture for tests/cli/practices-check.spec.ts — properly typed assert block.
import { defineAssertBlock, Trait, type Checkpoint } from "../../../dist/index.js";

type FixtureScreen = Checkpoint<"FixtureScreen">;

export const TypedFixtureBlock = defineAssertBlock<FixtureScreen>({
  name: "typed-fixture",
  checkpoint: "FixtureScreen",
  verify: [Trait.visible("#fixture")],
});
