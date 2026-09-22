// Fixture for tests/cli/practices-check.spec.ts — wildcard Checkpoint<string>.
import { defineMethodBlock, checkpoint, Checkpoint } from "../../../dist/index.js";

export const WildcardFixtureBlock = defineMethodBlock<Checkpoint<string>, Checkpoint<string>>({
  name: "wildcard-checkpoint-fixture",
  instruction: {
    act: async () => {},
    resolve: () => checkpoint("FixtureScreen"),
  },
});
