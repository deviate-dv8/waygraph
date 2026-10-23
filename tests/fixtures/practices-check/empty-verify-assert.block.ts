// Fixture — defineAssertBlock with an empty verify array (bad practice: a no-op assertion).
import { defineAssertBlock, checkpoint } from "../../../dist/index.js";

export const EmptyVerifyAssertBlock = defineAssertBlock({
  name: "empty-verify-assert-fixture",
  checkpoint: checkpoint("FixtureScreen"),
  verify: [],
});
