import { engine } from "../../../config/waygraph.config.js";
import { DemoSel } from "../../map/(app_base)/home/_sel.js";
import { NavHomeBlock } from "../../map/(app_base)/home/_nav.block.js";
import { AssertHelloBlock } from "../../map/(app_base)/home/_methods/assert-hello.method.block.js";
import { NavDocsBlock } from "../../map/(app_base)/docs/_nav.block.js";
// Page hubs registered for auto/docs grouping (arrival-only after nav).
import "../../map/(app_base)/home/_page.block.js";
import "../../map/(app_base)/docs/_page.block.js";

/** Smoke: nav + assert (no mem), then nav to the sibling docs/ page. Green offline. */
export const homeHelloFlow = engine
  .map()
  .start()
  .gotoPage(
    NavHomeBlock.stubBefore((ctx) => {
      ctx.title("Scaffold: Hello Waygraph");
    }).stubAfter((ctx) => {
      ctx.ring("title", { selector: DemoSel.title, label: "Home heading", duration: true });
    }).stubOnError((ctx) => {
      ctx.ring("title", { selector: DemoSel.title, label: "Home heading at failure" });
    }),
  )
  .assert(
    AssertHelloBlock.stubBefore((ctx) => {
      ctx.ring("title", { selector: DemoSel.title, label: "Heading about to check" });
    })
      .stubAfter((ctx) => {
        ctx.ring("title", {
          selector: DemoSel.title,
          label: "AC · Hello visible",
          detail: "Replace this copy with your ticket lines.",
          tag: "AC",
          duration: true,
        });
        ctx.ring("sub", { selector: DemoSel.sub, label: "Subcopy", duration: 1500 });
        ctx.slides([
          { caption: "Scaffold covers auto + narration", detail: "Page hub, Effect instanceOptions, stubs, YAP.", tag: "YAP", duration: true },
        ]);
      })
      .stubOnError((ctx) => {
        ctx.ring("title", { selector: DemoSel.title, label: "Heading at failure", tag: "FAIL" });
      }),
  )
  .gotoPage(NavDocsBlock)
  .end();
