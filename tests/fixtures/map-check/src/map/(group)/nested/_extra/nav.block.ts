// Fixture for tests/cli/map.spec.ts - proves a leading-underscore folder
// segment (same convention as _methods/) is excluded from the verbatim
// folder-vs-URL comparison, same as a (group) segment: this file's real
// folder is "nested/_extra", but its url is just "/nested" - a compliant
// match once "_extra" is correctly excluded.
import { defineNavBlock } from "../../../../../../../../dist/index.js";

export const NavNestedFixtureBlock = defineNavBlock({
  name: "nav-nested-fixture",
  checkpoint: "NestedFixture",
  url: "http://127.0.0.1:1/nested",
});
