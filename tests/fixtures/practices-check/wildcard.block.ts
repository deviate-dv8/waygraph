// Fixture for tests/cli/practices-check.spec.ts — wildcard Checkpoint<string>.
import { defineMethodBlock, Checkpoint } from "../../../dist/index.js";

export const WildcardFixtureBlock = defineMethodBlock<Checkpoint<string>, Checkpoint<string>>({
  name: "wildcard-checkpoint-fixture",
  checkpoint: "FixtureScreen",
  act: async () => {},
});
