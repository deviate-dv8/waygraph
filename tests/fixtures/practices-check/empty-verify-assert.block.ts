// Fixture — defineExpectBlock with an empty verify array (bad practice: a no-op assertion).
import { defineExpectBlock, checkpoint } from "../../../dist/index.js";

export const EmptyVerifyAssertBlock = defineExpectBlock({
  name: "empty-verify-assert-fixture",
  checkpoint: checkpoint("FixtureScreen"),
  verify: [],
});
