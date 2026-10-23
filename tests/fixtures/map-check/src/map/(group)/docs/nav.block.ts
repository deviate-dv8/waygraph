// Fixture for tests/cli/map.spec.ts - a relative url ending in index.html is its folder.
import { defineNavBlock, checkpoint } from "../../../../../../../dist/index.js";

export const NavDocsIndexFixtureBlock = defineNavBlock({
  name: "nav-docs-index-fixture",
  checkpoint: checkpoint("DocsIndexFixture"),
  url: "docs/index.html",
});
