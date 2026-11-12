import { engine } from "#config/waygraph.config";
import { HomePage } from "#map/(app_base)/home/_page.block";
import { DemoSel } from "#map/(app_base)/home/_sel";
import { TopBar } from "#map/(app_base)/_layout.block";

const OpenHome = HomePage
  .stubBefore((ctx) => {
    ctx.ui.title("Scaffold: Hello Waygraph");
  })
  .stubAfter((ctx) => {
    ctx.ui.ring("title", { selector: DemoSel.title, label: "Home heading", duration: true });
  })
  .stubOnError((ctx) => {
    ctx.ui.ring("title", { selector: DemoSel.title, label: "Home heading at failure" });
  });

const HelloShown = HomePage.expects.hello
  .stubAfter((ctx) => {
    ctx.ui.ring("title", {
      selector: DemoSel.title,
      label: "AC · Hello visible",
      detail: "Replace this copy with your ticket lines.",
      tag: "AC",
      duration: true,
    });
    ctx.ui.ring("sub", { selector: DemoSel.sub, label: "Subcopy", duration: 1500 });
    ctx.ui.slides([
      { caption: "Scaffold covers auto + narration", detail: "Page hub, a Method's instanceOptions, stubs, YAP.", tag: "YAP", duration: true },
    ]);
  })
  .stubOnError((ctx) => {
    ctx.ui.ring("title", { selector: DemoSel.title, label: "Heading at failure", tag: "FAIL" });
  });

/** Smoke: open home and expect the greeting (no mem), then the top bar to docs and back. Green offline. */
export const homeHelloFlow = engine
  .map()
  .gotoPage(OpenHome, { expect: [HelloShown] })
  .gotoPage(TopBar.go.docs)
  .gotoPage(TopBar.go.home);
