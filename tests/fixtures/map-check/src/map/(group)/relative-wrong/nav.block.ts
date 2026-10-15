// Fixture for tests/cli/map.spec.ts - a relative url (the normal baseUrl case) is checked too.
import { defineNavBlock } from "../../../../../../../dist/index.js";

export const NavRelativeWrongFixtureBlock = defineNavBlock({
  name: "nav-relative-wrong-fixture",
  checkpoint: "RelativeWrongFixture",
  url: "/somewhere-else",
});
