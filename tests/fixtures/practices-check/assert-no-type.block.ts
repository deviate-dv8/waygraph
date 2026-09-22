// Fixture for tests/cli/practices-check.spec.ts — assert block without explicit type arg.
import { defineAssertBlock, Trait } from "../../../dist/index.js";

export const AssertNoTypeFixtureBlock = defineAssertBlock({
  name: "assert-no-type-fixture",
  checkpoint: "FixtureScreen",
  verify: [Trait.visible("#fixture")],
});
