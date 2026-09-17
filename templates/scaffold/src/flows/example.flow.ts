import { Engine, start, end, withTitle, withHighlightFixtures } from "waygraph";
import { NavHomeBlock } from "../blocks/demo-web/nav-home.block.js";
import { AssertHelloBlock } from "../blocks/demo-web/methods/assert-hello.method.block.js";
// Page hub registered for auto/docs grouping (arrival-only after nav).
import "../blocks/demo-web/home.page.block.js";

const engine = new Engine();

/** Smoke: nav + assert (no mem). Green offline. */
export const exampleFlow = withHighlightFixtures(
  withTitle(
    engine.defineFlow([start, NavHomeBlock, AssertHelloBlock, end]),
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
