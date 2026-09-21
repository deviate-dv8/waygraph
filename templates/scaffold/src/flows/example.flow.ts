import { Engine, start, end, withTitle, withHighlightFixtures } from "waygraph";
import { NavHomeBlock } from "../map/(app_base)/home/_nav.block.js";
import { AssertHelloBlock } from "../map/(app_base)/home/_methods/assert-hello.method.block.js";
import { NavDocsBlock } from "../map/(app_base)/docs/_nav.block.js";
// Page hubs registered for auto/docs grouping (arrival-only after nav).
import "../map/(app_base)/home/_page.block.js";
import "../map/(app_base)/docs/_page.block.js";

const engine = new Engine();

/** Smoke: nav + assert (no mem), then nav to the sibling docs/ page. Green offline. */
export const exampleFlow = withHighlightFixtures(
  withTitle(
    engine.defineFlow([start, NavHomeBlock, AssertHelloBlock, NavDocsBlock, end]),
    "Scaffold: Hello Waygraph",
  ),
  {
    "assert-hello": {
      stubAfter: {
        title: {
          label: "AC · Hello visible",
          detail: "Replace this fixture copy with your ticket lines.",
          tag: "AC",
          duration: true,
        },
      },
    },
  },
);
