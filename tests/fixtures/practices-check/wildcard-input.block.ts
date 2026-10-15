// Fixture for tests/cli/practices-check.spec.ts — wildcard input (reachable from anywhere), typed output: not flagged.
import { defineMethodBlock, checkpoint, Checkpoint } from "../../../dist/index.js";

export const WildcardInputFixtureBlock = defineMethodBlock<
  Checkpoint<string>,
  Checkpoint<"FixtureScreen">
>({
  name: "wildcard-input-fixture",
  instruction: {
    act: async () => {},
    resolve: () => checkpoint("FixtureScreen"),
  },
});
