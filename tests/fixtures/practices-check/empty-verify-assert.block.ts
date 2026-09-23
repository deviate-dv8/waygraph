// Fixture — defineAssertBlock with an empty verify array (bad practice: a no-op assertion).
import { defineAssertBlock, type Checkpoint } from "../../../dist/index.js";

type FixtureScreen = Checkpoint<"FixtureScreen">;

export const EmptyVerifyAssertBlock = defineAssertBlock<FixtureScreen>({
  name: "empty-verify-assert-fixture",
  checkpoint: "FixtureScreen",
  verify: [],
});
