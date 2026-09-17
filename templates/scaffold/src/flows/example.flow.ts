import { Engine, start, end, withTitle, withHighlightFixtures } from "waygraph";
import { NavHomeBlock } from "../blocks/demo-web/nav-home.block.js";
import { AssertHelloBlock } from "../blocks/demo-web/methods/assert-hello.method.block.js";

const engine = new Engine();

/**
 * Offline example: nav to data: hello page, then assert heading.
 * Flow fixtures override ticket-style copy on stubs (demo narration).
 */
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
