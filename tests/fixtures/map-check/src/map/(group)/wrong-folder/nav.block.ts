// Fixture for tests/cli/map.spec.ts - deliberately violates the Waygraph Map
// convention: its static url's real path ("actually-different") does not
// verbatim-match this file's own folder name ("wrong-folder") - the exact
// class of bug `waygraph map` exists to catch (e.g. the real (auth)/signin/
// mistake grouping a page whose real URL is /signin, not /auth/signin).
import { defineNavBlock } from "../../../../../../../dist/index.js";

export const NavWrongFixtureBlock = defineNavBlock({
  name: "nav-wrong-fixture",
  checkpoint: "WrongFixture",
  url: "http://127.0.0.1:1/actually-different",
});
