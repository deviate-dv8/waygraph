import { Engine } from "waygraph";
import { DemoSel } from "../map/(app_base)/home/_sel.js";
import { NavHomeBlock } from "../map/(app_base)/home/_nav.block.js";
import { AssertHelloBlock } from "../map/(app_base)/home/_methods/assert-hello.method.block.js";
import { NavDocsBlock } from "../map/(app_base)/docs/_nav.block.js";
// Page hubs registered for auto/docs grouping (arrival-only after nav).
import "../map/(app_base)/home/_page.block.js";
import "../map/(app_base)/docs/_page.block.js";

const engine = new Engine();

/** Smoke: nav + assert (no mem), then nav to the sibling docs/ page. Green offline. */
export const exampleFlow = engine
  .map()
  .start()
  .gotoPage(NavHomeBlock)
  .assert(
    AssertHelloBlock.stubAfter((ctx) => {
      ctx.ring("title", {
        selector: DemoSel.title,
        label: "AC · Hello visible",
        detail: "Replace this copy with your ticket lines.",
        tag: "AC",
        duration: true,
      });
    }),
  )
  .gotoPage(NavDocsBlock)
  .end({ title: "Scaffold: Hello Waygraph" });
