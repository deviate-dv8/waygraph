// Fixture for tests/cli/map.spec.ts - a compliant Nav Block: its static url's
// last path segment ("home") verbatim-matches this file's own folder name
// ("home"), same as the (group) parens themselves being excluded from the
// comparison (purely organizational, same as Next.js route groups).
import { defineNavBlock } from "../../../../../../../dist/index.js";

export const NavHomeFixtureBlock = defineNavBlock({
  name: "nav-home-fixture",
  checkpoint: "HomeFixture",
  url: "http://127.0.0.1:1/home",
});
